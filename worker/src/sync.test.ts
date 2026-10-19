import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { GameOp, ItemOp, ListOp, Op, SyncResponse, ViewOp } from "@backlog/shared/sync";
import { testWorker } from "./testing.ts";

let w: Awaited<ReturnType<typeof testWorker>>;
beforeAll(async () => { w = await testWorker({ DEV_LOGIN: "true", STEAM_API_KEY: "key" }); });
afterAll(() => w.dispose());

let n = 0;
const op = (appid: number, set: GameOp["set"], id = `op-${++n}`): Op => ({ id, type: "game", appid, at: 1_000, set });
const viewOp = (viewId: string, set: ViewOp["set"]): Op => ({ id: `op-${++n}`, type: "view", viewId, at: 1_000, set });
const listOp = (listId: string, set: ListOp["set"]): Op => ({ id: `op-${++n}`, type: "list", listId, at: 1_000, set });
const itemOp = (listId: string, appid: number, set: ItemOp["set"]): Op => ({ id: `op-${++n}`, type: "item", listId, appid, at: 1_000, set });
const NEW_LIST = { title: "Up next", description: "", kind: "manual", filter: null, sort: null, shareId: "upnext000001", visibility: "private", position: "i", deleted: false } as const;
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
    igdb: null, community: null, status: "backlog", statusAt: null, finishedAt: null, note: "", my: null, myKind: null, triageDeclined: false,
  });
  expect((await sync(r.rev)).games).toEqual([]);
});

test("ONB-5: declining the finished-games offer for a game syncs, and so does its undo", async () => {
  const { rev } = await sync(0);
  const r = await sync(rev, [op(2, { triageDeclined: true }), op(3, { triageDeclined: "yes" as never })]);
  expect(r.games.map(g => [g.appid, g.triageDeclined])).toEqual([[2, true]]);
  const undo = await sync(r.rev, [op(2, { triageDeclined: false })]);
  expect(undo.games.find(g => g.appid === 2)).toMatchObject({ triageDeclined: false });
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

test("SYNC-2: several ops on one game in one request: the last one wins per field", async () => {
  const r = await sync(0, [op(3, { status: "playing", statusAt: 1 }), op(3, { status: "dropped", statusAt: 2 }), op(3, { note: "meh" })]);
  expect(r.games.find(g => g.appid === 3)).toMatchObject({ status: "dropped", statusAt: 2, note: "meh" });
});

test("SYNC-2: a retried op is not applied twice", async () => {
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

test("SYNC-3: users only see and change their own games", async () => {
  await sync(0, [op(1, { note: "mine" })]);
  await w.call("POST", "/api/auth/dev", { steamId: "76561199999999999" });
  const other = await sync(0, [op(1, { note: "theirs" })]);
  expect(other.games).toEqual([]);
  const notes = await w.env.DB.prepare("SELECT note FROM user_games WHERE appid = 1 AND note != ''").all();
  expect(notes.results).not.toContainEqual({ note: "theirs" });
});

test("views: create, edit, delete; each change comes back once, with games in the same rev sequence", async () => {
  const { rev } = await sync(0);
  const created = await sync(rev, [
    op(1, { status: "playing" }),
    viewOp("v1", { name: "Short", filter: { maxHours: 5 }, sort: "length", position: "a", deleted: false }),
  ]);
  expect(created.views).toEqual([{ id: "v1", name: "Short", filter: { maxHours: 5 }, sort: "length", position: "a", deleted: false }]);
  expect(created.rev).toBe(rev + 2);
  expect((await sync(created.rev)).views).toEqual([]);

  const renamed = await sync(created.rev, [viewOp("v1", { name: "Very short", filter: { maxHours: 2 } })]);
  expect(renamed.views[0]).toMatchObject({ name: "Very short", filter: { maxHours: 2 }, sort: "length", position: "a" });
  const deleted = await sync(renamed.rev, [viewOp("v1", { deleted: true })]);
  expect(deleted.views).toEqual([expect.objectContaining({ id: "v1", deleted: true, name: "Very short" })]);
  // A full sync still sends deleted views, so a device that had one drops it
  expect((await sync(0)).views.map(v => [v.id, v.deleted])).toEqual([["v1", true]]);
});

test("SYNC-3: another user can't touch a view by guessing its id; bad view ops are dropped", async () => {
  await sync(0, [viewOp("shared-id", { name: "Mine", filter: {}, sort: "name", position: "a", deleted: false })]);
  await w.call("POST", "/api/auth/dev", { steamId: `76561198${String(++n).padStart(9, "0")}` });
  const r = await sync(0, [
    viewOp("shared-id", { name: "Stolen" }),
    viewOp("bad", { sort: "nope" as never }),
    viewOp("long", { name: "x".repeat(61) }),
  ]);
  expect(r.views).toEqual([]);
  const row = await w.env.DB.prepare("SELECT name FROM views WHERE id = 'shared-id'").first("name");
  expect(row).toBe("Mine");
});

test("lists and their games: create, reorder, remove, delete, in one rev sequence", async () => {
  const { rev } = await sync(0);
  const created = await sync(rev, [listOp("l1", NEW_LIST), itemOp("l1", 1, { position: "i", deleted: false }), itemOp("l1", 2, { position: "r", deleted: false })]);
  expect(created.lists).toEqual([{ id: "l1", ...NEW_LIST }]);
  expect(created.items).toEqual(expect.arrayContaining([
    { listId: "l1", appid: 1, position: "i", deleted: false }, { listId: "l1", appid: 2, position: "r", deleted: false },
  ]));
  expect(created.rev).toBe(rev + 3);

  // The share id is fixed once the list exists
  const moved = await sync(created.rev, [itemOp("l1", 2, { position: "a" }), itemOp("l1", 1, { deleted: true }), listOp("l1", { title: "Soon", shareId: "changed00001" })]);
  expect(moved.lists).toEqual([expect.objectContaining({ title: "Soon", shareId: "upnext000001" })]);
  expect(moved.items).toEqual(expect.arrayContaining([
    { listId: "l1", appid: 2, position: "a", deleted: false }, { listId: "l1", appid: 1, position: "i", deleted: true },
  ]));

  const filter = await sync(moved.rev, [listOp("l2", { ...NEW_LIST, kind: "filter", filter: { maxHours: 5 }, sort: "length", shareId: "short0000001" })]);
  expect(filter.lists[0]).toMatchObject({ id: "l2", kind: "filter", filter: { maxHours: 5 }, sort: "length" });
  const deleted = await sync(filter.rev, [listOp("l1", { deleted: true })]);
  expect(deleted.lists).toEqual([expect.objectContaining({ id: "l1", deleted: true })]);
});

test("SYNC-3: another user can't touch a list or add games to it, nor take its share id; bad list ops are dropped", async () => {
  await sync(0, [listOp("their-list", { ...NEW_LIST, shareId: "theirs000001" }), itemOp("their-list", 1, { position: "i", deleted: false })]);
  await w.call("POST", "/api/auth/dev", { steamId: `76561198${String(++n).padStart(9, "0")}` });
  const r = await sync(0, [
    listOp("their-list", { title: "Stolen" }),
    itemOp("their-list", 2, { position: "j", deleted: false }),
    itemOp("their-list", 1, { deleted: true }),
    listOp("bad", { ...NEW_LIST, visibility: "public" as never }),
    listOp("bad-share-id", { ...NEW_LIST, shareId: "a/b" }),
    itemOp("bad-pos", 1, { position: "I" }),
    listOp("same-share-id", { ...NEW_LIST, shareId: "theirs000001" }),
  ]);
  expect(r.lists).toEqual([]);
  expect(r.items).toEqual([]);
  expect(await w.env.DB.prepare("SELECT title FROM lists WHERE id = 'their-list'").first("title")).toBe("Up next");
  const items = await w.env.DB.prepare("SELECT appid, deleted FROM list_items WHERE list_id = 'their-list'").all();
  expect(items.results).toEqual([{ appid: 1, deleted: 0 }]);
});
