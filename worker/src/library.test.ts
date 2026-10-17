import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { testWorker } from "./testing.ts";

let w: Awaited<ReturnType<typeof testWorker>>;
beforeAll(async () => { w = await testWorker({ DEV_LOGIN: "true", STEAM_API_KEY: "key" }); });
afterAll(() => w.dispose());
afterEach(() => vi.restoreAllMocks());

type Owned = { appid: number; name?: string; playtime_forever?: number; rtime_last_played?: number };

function stubOwned(response: { games?: Owned[] }) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/")) return Response.json({ response });
    return real(input, init);
  });
}

const rows = async (steamId: string) => (await w.env.DB.prepare(
  `SELECT ug.appid, g.name, ug.status, ug.playtime_min, ug.last_played_at, ug.first_seen_at, ug.rev
   FROM user_games ug JOIN games g USING (appid) JOIN users u ON u.id = ug.user_id WHERE u.steam_id = ? ORDER BY appid`,
).bind(steamId).all()).results;

test("imports the library, then only bumps rows that changed", async () => {
  await w.call("POST", "/api/auth/dev", { steamId: "76561198000000010" });
  const steam = stubOwned({ games: [
    { appid: 10, name: "Counter-Strike", playtime_forever: 120, rtime_last_played: 1_600_000_000 },
    { appid: 20, name: "Command &amp; Conquer", playtime_forever: 0, rtime_last_played: 0 },
    { appid: 30 },
  ] });
  const res = await w.call("POST", "/api/library/refresh");
  expect(await res.json()).toEqual({ added: 3, total: 3 });
  expect(String(steam.mock.calls.at(-1)![0])).toContain("steamid=76561198000000010");

  const first = await rows("76561198000000010");
  expect(first.map(r => [r.appid, r.name, r.status, r.playtime_min])).toEqual([
    [10, "Counter-Strike", "backlog", 120],
    [20, "Command & Conquer", "backlog", 0],
    [30, "Steam app 30", "backlog", 0],
  ]);
  expect(first[0].first_seen_at).toBe(1_600_000_000_000); // played before the import
  expect(new Set(first.map(r => r.rev)).size).toBe(3);

  stubOwned({ games: [
    { appid: 10, name: "Counter-Strike", playtime_forever: 180, rtime_last_played: 1_700_000_000 },
    { appid: 20, name: "Command &amp; Conquer", playtime_forever: 0, rtime_last_played: 0 },
    { appid: 30 },
    { appid: 40, name: "New Game" },
  ] });
  expect(await (await w.call("POST", "/api/library/refresh")).json()).toEqual({ added: 1, total: 4 });
  const second = await rows("76561198000000010");
  const maxFirst = Math.max(...first.map(r => r.rev as number));
  expect(second[0]).toMatchObject({ playtime_min: 180, last_played_at: 1_700_000_000_000 });
  expect(second[0].rev).toBeGreaterThan(maxFirst);
  expect(second[1].rev).toBe(first[1].rev);
  expect(second[3].rev).toBeGreaterThan(maxFirst);
  expect(second[0].rev).not.toBe(second[3].rev);
});

test("keeps a known name when Steam has none (delisted apps)", async () => {
  await w.call("POST", "/api/auth/dev", { steamId: "76561198000000011" });
  stubOwned({ games: [{ appid: 50, name: "Real Name" }] });
  await w.call("POST", "/api/library/refresh");
  await w.call("POST", "/api/auth/dev", { steamId: "76561198000000012" });
  stubOwned({ games: [{ appid: 50 }] });
  await w.call("POST", "/api/library/refresh");
  expect((await rows("76561198000000012"))[0].name).toBe("Real Name");
});

test("a private profile is an error the client can explain", async () => {
  await w.call("POST", "/api/auth/dev", { steamId: "76561198000000013" });
  stubOwned({});
  const res = await w.call("POST", "/api/library/refresh");
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "profile_private" });
});

test("imports a large library in one request", async () => {
  await w.call("POST", "/api/auth/dev", { steamId: "76561198000000014" });
  stubOwned({ games: Array.from({ length: 5000 }, (_, i) => ({ appid: 100_000 + i, name: `Game ${i}`, playtime_forever: i % 7 })) });
  expect(await (await w.call("POST", "/api/library/refresh")).json()).toEqual({ added: 5000, total: 5000 });
});

test("needs a session", async () => {
  w.signOut();
  expect((await w.call("POST", "/api/library/refresh")).status).toBe(401);
});

test("dev sign-in with a made-up SteamID gets the dev library, even with a real key", async () => {
  const steam = stubOwned({ games: [] });
  await w.call("POST", "/api/auth/dev", { steamId: "76561190000000099" });
  expect(await (await w.call("POST", "/api/library/refresh")).json()).toEqual({ added: 5, total: 5 });
  expect(steam.mock.calls.some(([u]) => String(u).includes("GetOwnedGames"))).toBe(false);
});
