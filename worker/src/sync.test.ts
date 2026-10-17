import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { Op, SyncResponse } from "@backlog/shared/sync";
import { testWorker } from "./testing.ts";

let w: Awaited<ReturnType<typeof testWorker>>;
beforeAll(async () => { w = await testWorker({ DEV_LOGIN: "true", STEAM_API_KEY: "key" }); });
afterAll(() => w.dispose());

let n = 0;
const op = (appid: number, set: Op["set"], id = `op-${++n}`): Op => ({ id, type: "game", appid, at: 1_000, set });
// Catalog rows written in the last minute come back on every sync; "later" skips that overlap
const LATER = Date.now() + 120_000;
const sync = async (since: number, ops: Op[] = [], catalogSince = since ? LATER : 0) =>
  (await (await w.call("POST", "/api/sync", { since, catalogSince, ops })).json()) as SyncResponse;

/** A signed-in user owning games 1, 2 and 3. */
beforeEach(async () => {
  await w.call("POST", "/api/auth/dev", { steamId: `76561198${String(++n).padStart(9, "0")}` });
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    String(input).includes("GetOwnedGames")
      ? Response.json({ response: { games: [1, 2, 3].map(appid => ({ appid, name: `Game ${appid}`, playtime_forever: appid * 10 })) } })
      : real(input, init));
  await w.call("POST", "/api/library/refresh");
  vi.restoreAllMocks();
});

test("first sync returns the whole library as client games", async () => {
  const r = await sync(0);
  expect(r.games).toHaveLength(3);
  expect(r.games.find(g => g.appid === 2)).toEqual({
    appid: 2, name: "Game 2", portrait: null, playtimeMin: 20, lastPlayedAt: null, addedAt: expect.any(Number),
    igdb: null, community: null, status: "backlog", statusAt: null, finishedAt: null, note: "", my: null, myKind: null,
  });
  expect((await sync(r.rev)).games).toEqual([]);
});

test("ops set fields, and later syncs return only what changed", async () => {
  const { rev } = await sync(0);
  const r = await sync(rev, [
    op(1, { status: "finished", statusAt: 5, finishedAt: 5 }),
    op(2, { note: "after the holidays" }),
    op(2, { my: { main: null, main_extra: 7.5, comp: null }, myKind: "exact" }),
  ]);
  expect(r.games.map(g => g.appid).sort()).toEqual([1, 2]);
  expect(r.games.find(g => g.appid === 1)).toMatchObject({ status: "finished", statusAt: 5, finishedAt: 5, note: "" });
  expect(r.games.find(g => g.appid === 2)).toMatchObject({
    status: "backlog", note: "after the holidays", my: { main: null, main_extra: 7.5, comp: null }, myKind: "exact",
  });

  // Undo is an op with the previous values; null clears
  const undo = await sync(r.rev, [op(1, { status: "backlog", statusAt: null, finishedAt: null }), op(2, { my: null, myKind: null })]);
  expect(undo.games.find(g => g.appid === 1)).toMatchObject({ status: "backlog", statusAt: null, finishedAt: null });
  expect(undo.games.find(g => g.appid === 2)).toMatchObject({ my: null, myKind: null, note: "after the holidays" });
  expect(undo.rev).toBeGreaterThan(r.rev);
});

test("several ops on one game in one request: the last one wins per field", async () => {
  const r = await sync(0, [op(3, { status: "playing", statusAt: 1 }), op(3, { status: "dropped", statusAt: 2 }), op(3, { note: "meh" })]);
  expect(r.games.find(g => g.appid === 3)).toMatchObject({ status: "dropped", statusAt: 2, note: "meh" });
});

test("a retried op is not applied twice", async () => {
  const first = op(1, { status: "playing", statusAt: 1 }, "same-id");
  await sync(0, [first]);
  await sync(0, [op(1, { status: "finished", statusAt: 2, finishedAt: 2 })]);
  const r = await sync(0, [first]); // the response to the first request was lost; the client sends it again
  expect(r.games.find(g => g.appid === 1)).toMatchObject({ status: "finished" });
});

test("ignores invalid ops and games the user doesn't own", async () => {
  const r = await sync(0, [
    op(1, { status: "wishlist" as never }),
    op(1, { note: 42 as never }),
    op(999, { status: "finished" }),
    { id: "x", type: "nope", appid: 2, at: 0, set: {} } as never,
  ]);
  expect(r.games.find(g => g.appid === 1)).toMatchObject({ status: "backlog", note: "" });
  const count = await w.env.DB.prepare("SELECT count(*) AS n FROM user_games WHERE appid = 999").first("n");
  expect(count).toBe(0);
});

test("catalog changes come back without a rev change", async () => {
  const r = await sync(0);
  await w.env.DB.prepare("UPDATE games SET updated_at = 0").run();
  await w.env.DB.prepare("UPDATE games SET igdb_main = 4, igdb_main_extra = 6, igdb_count = 9, updated_at = ? WHERE appid = 2")
    .bind(r.catalogAt + 1).run();
  const next = await sync(r.rev, [], r.catalogAt);
  expect(next.games.map(g => g.appid)).toEqual([2]);
  expect(next.games[0].igdb).toEqual({ main: 4, main_extra: 6, comp: null, count: 9 });
});

test("users only see and change their own games", async () => {
  await sync(0, [op(1, { note: "mine" })]);
  await w.call("POST", "/api/auth/dev", { steamId: "76561199999999999" });
  const other = await sync(0, [op(1, { note: "theirs" })]);
  expect(other.games).toEqual([]);
  const notes = await w.env.DB.prepare("SELECT note FROM user_games WHERE appid = 1 AND note != ''").all();
  expect(notes.results).not.toContainEqual({ note: "theirs" });
});
