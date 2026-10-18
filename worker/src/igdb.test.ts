import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { SyncResponse } from "@backlog/shared/sync";
import { enrich } from "./igdb.ts";
import { testWorker } from "./testing.ts";

let w: Awaited<ReturnType<typeof testWorker>>;
beforeAll(async () => { w = await testWorker({ DEV_LOGIN: "true", STEAM_API_KEY: "key", TWITCH_CLIENT_ID: "id", TWITCH_CLIENT_SECRET: "secret" }); });
afterAll(() => w.dispose());
afterEach(() => vi.restoreAllMocks());

const H = 3600;
/** A small IGDB: Steam mappings, name search results, times to beat and version parents. */
const IGDB = {
  steam: new Map([[10, 100], [30, 300]]),
  search: new Map<string, { id: number; name: string }[]>([
    ["Command & Conquer", [{ id: 200, name: "Command & Conquer" }]],
    ["Unrelated", [{ id: 500, name: "Unrelated Deluxe" }]],
  ]),
  ttb: new Map([[100, { hastily: 5 * H, normally: 8.1 * H, completely: 12 * H, count: 7 }], [201, { normally: 20 * H, count: 2 }]]),
  versionParent: new Map([[200, 201]]),
};

let calls: { url: string; body: string }[] = [];
function stubApis(owned: { appid: number; name: string }[] = []) {
  calls = [];
  const real = globalThis.fetch;
  const ids = (body: string) => [...(body.match(/\(([^)]*)\)/)?.[1] ?? "").matchAll(/\d+/g)].map(m => Number(m[0]));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = String(init?.body ?? "");
    if (url.includes("GetOwnedGames")) return Response.json({ response: { games: owned } });
    if (!url.startsWith("https://id.twitch.tv/") && !url.startsWith("https://api.igdb.com/")) return real(input, init);
    calls.push({ url, body });
    if (url.startsWith("https://id.twitch.tv/oauth2/token")) return Response.json({ access_token: `token-${calls.length}`, expires_in: 5_000_000 });
    const endpoint = url.split("/v4/")[1];
    if (endpoint === "external_games") {
      return Response.json(ids(body).filter(a => IGDB.steam.has(a)).map(a => ({ game: IGDB.steam.get(a), uid: String(a) })));
    }
    if (endpoint === "games" && body.startsWith("search")) return Response.json(IGDB.search.get(body.match(/search "(.*)";/)![1]) ?? []);
    if (endpoint === "games") return Response.json(ids(body).filter(id => IGDB.versionParent.has(id)).map(id => ({ id, version_parent: IGDB.versionParent.get(id) })));
    if (endpoint === "game_time_to_beats") return Response.json(ids(body).filter(id => IGDB.ttb.has(id)).map(id => ({ game_id: id, ...IGDB.ttb.get(id) })));
    return new Response("unknown endpoint", { status: 400 });
  });
}

const GAMES = [
  { appid: 10, name: "Matched by Steam" },
  { appid: 20, name: "Command & Conquer" },
  { appid: 30, name: "No Time Yet" },
  { appid: 40, name: "Steam app 40" },
  { appid: 50, name: "Unrelated" },
];
const row = (appid: number) => w.env.DB.prepare("SELECT * FROM games WHERE appid = ?").bind(appid).first<Record<string, number | null>>();

beforeEach(async () => {
  await w.env.DB.prepare("DELETE FROM games").run();
  await w.env.DB.prepare("DELETE FROM cache").run();
  const insert = w.env.DB.prepare("INSERT INTO games (appid, name, updated_at) VALUES (?, ?, 0)");
  await w.env.DB.batch(GAMES.map(g => insert.bind(g.appid, g.name)));
});

test("finds lengths by Steam app ID, by exact name, and through the version parent", async () => {
  stubApis();
  expect(await enrich(w.env, 1_000_000, 0)).toEqual({ checked: 5, found: 2 });
  expect(await row(10)).toMatchObject({ igdb_id: 100, igdb_main: 5, igdb_main_extra: 8, igdb_comp: 12, igdb_count: 7, igdb_checked_at: 1_000_000, updated_at: 1_000_000 });
  expect(await row(20)).toMatchObject({ igdb_id: 200, igdb_main: null, igdb_main_extra: 20, igdb_count: 2 });
  expect(await row(30)).toMatchObject({ igdb_id: 300, igdb_main_extra: null, igdb_checked_at: 1_000_000, updated_at: 0 });
  expect(await row(50)).toMatchObject({ igdb_id: null, igdb_checked_at: 1_000_000 });
  // No name search for delisted apps or games already matched by Steam app ID
  expect(calls.filter(c => c.body.startsWith("search")).map(c => c.body)).toEqual([
    'search "Command & Conquer"; fields id,name; limit 10;', 'search "Unrelated"; fields id,name; limit 10;',
  ]);
});

test("rechecks unknown games after a week and known ones after a month, reusing the token", async () => {
  stubApis();
  await enrich(w.env, 1_000_000, 0);
  expect(await enrich(w.env, 1_000_000 + 60_000, 0)).toEqual({ checked: 0, found: 0 });
  const week = 8 * 24 * H * 1000;
  expect((await enrich(w.env, 1_000_000 + week, 0)).checked).toBe(3); // 30, 40, 50
  expect(calls.filter(c => c.url.includes("id.twitch.tv"))).toHaveLength(1);
  const month = 31 * 24 * H * 1000;
  expect((await enrich(w.env, 1_000_000 + month, 0)).checked).toBe(5);
});

test("caps name searches per run; the rest waits for the next run", async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ appid: 1000 + i, name: `Obscure ${i}` }));
  const insert = w.env.DB.prepare("INSERT INTO games (appid, name, updated_at) VALUES (?, ?, 0)");
  await w.env.DB.batch(many.map(g => insert.bind(g.appid, g.name)));
  stubApis();
  await enrich(w.env, 1_000_000, 0);
  expect(calls.length).toBeLessThanOrEqual(50); // the free plan's outbound requests per run
  const waiting = await w.env.DB.prepare("SELECT count(*) AS n FROM games WHERE igdb_checked_at IS NULL").first("n");
  expect(waiting).toBe(7); // 47 need a name search (all but the two Steam matches and the delisted app); 40 got one
});

test("does nothing without Twitch credentials", async () => {
  stubApis();
  expect(await enrich({ ...w.env, TWITCH_CLIENT_ID: undefined })).toEqual({ checked: 0, found: 0 });
  expect(calls).toEqual([]);
});

test("ONB-4: new games get lengths right after an import, and sync sends them", async () => {
  await w.env.DB.prepare("DELETE FROM games").run();
  stubApis([{ appid: 10, name: "Matched by Steam" }]);
  await w.call("POST", "/api/auth/dev", { steamId: "76561198000000100" });
  await w.call("POST", "/api/library/refresh");
  await w.settle();
  const r = (await (await w.call("POST", "/api/sync", { since: 0, catalogSince: 0, ops: [] })).json()) as SyncResponse;
  expect(r.games[0].igdb).toEqual({ main: 5, main_extra: 8, comp: 12, count: 7 });
});
