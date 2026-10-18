import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { ListOp, Op, SyncResponse } from "@backlog/shared/sync";
import type { Profile, SharedList } from "@backlog/shared/share";
import { testWorker } from "./testing.ts";

const INDEX = `<!doctype html><html><head><title>Backlog</title></head><body></body></html>`;
let w: Awaited<ReturnType<typeof testWorker>>;
beforeAll(async () => {
  w = await testWorker({ DEV_LOGIN: "true", ASSETS: { fetch: async () => new Response(INDEX, { headers: { "content-type": "text/html" } }) } as never });
});
afterAll(() => w.dispose());

let n = 0;
const listOp = (listId: string, set: ListOp["set"]): Op => ({ id: `op-${++n}`, type: "list", listId, at: 1, set });
const sync = async (ops: Op[]) => (await (await w.call("POST", "/api/sync", { since: 0, catalogSince: 0, ops })).json()) as SyncResponse;
const LIST = { title: "Up <next>", description: "", kind: "manual", filter: null, sort: null, shareId: "upnext000001", visibility: "link", position: "i", deleted: false } as const;
let handle = "", steamId = "";

/** A signed-in user with the dev library (Portal 400, Portal 2 620, Half-Life 2 220, Terraria 105600, Stardew 413150). */
beforeEach(async () => {
  steamId = `76561190${String(++n).padStart(9, "0")}`;
  await w.call("POST", "/api/auth/dev", { steamId });
  await w.call("POST", "/api/library/refresh");
  handle = `player-${n}`;
});

const me = async () => (await (await w.call("GET", "/api/me")).json()) as { handle: string | null; profilePublic: boolean; showBacklog: boolean };

test("profile settings: a valid, unique handle; on needs one", async () => {
  expect((await w.call("POST", "/api/profile", { public: true })).status).toBe(400); // no handle yet
  expect((await w.call("POST", "/api/profile", { handle: "Bad Name" })).status).toBe(400);
  expect((await w.call("POST", "/api/profile", { handle: "-x" })).status).toBe(400);
  expect((await w.call("POST", "/api/profile", { public: "yes" })).status).toBe(400);
  expect((await w.call("POST", "/api/profile", { handle, public: true })).status).toBe(200);
  expect(await me()).toMatchObject({ handle, profilePublic: true, showBacklog: false });
  expect((await w.call("POST", "/api/profile", { showBacklog: true })).status).toBe(200);
  expect(await me()).toMatchObject({ handle, profilePublic: true, showBacklog: true }); // each setting changes alone

  const mine = handle;
  await w.call("POST", "/api/auth/dev", { steamId: "76561190999999999" });
  const taken = await w.call("POST", "/api/profile", { handle: mine });
  expect(taken.status).toBe(409);
  expect(await taken.json()).toEqual({ error: "handle_taken" });
});

test("LIST-14: a public profile: lists marked for it with their size, and stats; off is 404", async () => {
  await sync([
    listOp("pl1", { ...LIST, visibility: "profile", shareId: "onprofile001", position: "b" }),
    { id: `op-${++n}`, type: "item", listId: "pl1", appid: 620, at: 1, set: { position: "a", deleted: false } },
    { id: `op-${++n}`, type: "item", listId: "pl1", appid: 400, at: 1, set: { position: "b", deleted: false } },
    listOp("pl2", { ...LIST, kind: "filter", filter: { statuses: ["finished"] }, sort: "name", visibility: "profile", shareId: "onprofile002", position: "a" }),
    listOp("pl3", { ...LIST, visibility: "link", shareId: "linkonly0001" }),
    { id: `op-${++n}`, type: "game", appid: 400, at: 1, set: { status: "finished", my: { main: null, main_extra: 4, comp: null }, myKind: "exact" } },
  ]);
  expect((await w.call("GET", `/api/u/${handle}`)).status).toBe(404); // no handle yet
  await w.call("POST", "/api/profile", { handle, public: true });
  w.signOut();
  const p = (await (await w.call("GET", `/api/u/${handle}`)).json()) as Profile;
  expect(p).toEqual({
    handle, name: "Dev user", avatar: null, stats: { finished: 1, hoursCleared: 4 }, backlog: null,
    lists: [
      { shareId: "onprofile002", title: "Up <next>", description: "", kind: "filter", games: 1, hours: 4, covers: [400] },
      { shareId: "onprofile001", title: "Up <next>", description: "", kind: "manual", games: 2, hours: 4, covers: [620, 400] },
    ],
  });
  // Shared lists link to a public profile
  expect(((await (await w.call("GET", "/api/s/linkonly0001")).json()) as SharedList).owner.handle).toBe(handle);
  expect(await (await w.call("GET", `/u/${handle}`)).text()).toContain("<title>Dev user on Backlog</title>");

  await w.call("POST", "/api/auth/dev", { steamId }); // signed in again
  await w.call("POST", "/api/profile", { public: false });
  expect((await w.call("GET", `/api/u/${handle}`)).status).toBe(404);
  expect(((await (await w.call("GET", "/api/s/linkonly0001")).json()) as SharedList).owner.handle).toBeNull();
});

test("LIST-10 LIST-11: a shared list: games in order with lengths and status, nothing private; 304 until something changes", async () => {
  await sync([
    listOp("l1", LIST),
    { id: `op-${++n}`, type: "item", listId: "l1", appid: 220, at: 1, set: { position: "a", deleted: false } },
    { id: `op-${++n}`, type: "item", listId: "l1", appid: 400, at: 1, set: { position: "b", deleted: false } },
    { id: `op-${++n}`, type: "game", appid: 400, at: 1, set: { status: "finished", statusAt: 5, finishedAt: 5, note: "secret", my: { main: 3, main_extra: 4, comp: null }, myKind: "exact" } },
  ]);
  w.signOut(); // viewers don't need an account
  const res = await w.call("GET", `/api/s/upnext000001`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as SharedList;
  expect(data.owner).toEqual({ name: "Dev user", avatar: null, handle: null });
  expect(data.list).toEqual({ title: "Up <next>", description: "", kind: "manual", sort: null });
  expect(data.games.map(g => g.name)).toEqual(["Half-Life 2", "Portal"]);
  expect(data.games[1]).toMatchObject({ status: "finished", my: { main: 3, main_extra: 4, comp: null }, note: "", playtimeMin: 0, lastPlayedAt: null, finishedAt: null });
  expect(JSON.stringify(data)).not.toContain("secret");

  const etag = res.headers.get("etag")!;
  expect((await w.call("GET", `/api/s/upnext000001`, undefined, { "if-none-match": etag })).status).toBe(304);
  await w.env.DB.prepare("UPDATE games SET igdb_main = 9, updated_at = updated_at + 1 WHERE appid = 220").run();
  expect((await w.call("GET", `/api/s/upnext000001`, undefined, { "if-none-match": etag })).status).toBe(200);
});

test("filter lists are computed for viewers", async () => {
  await sync([
    listOp("f1", { ...LIST, kind: "filter", filter: { played: "never" }, sort: "name", shareId: "never0000001" }),
  ]);
  const data = (await (await w.call("GET", "/api/s/never0000001")).json()) as SharedList;
  expect(data.games.map(g => g.name)).toEqual(["Portal 2", "Stardew Valley"]);
});

test("LIST-12: private, deleted and missing lists are all 404", async () => {
  await sync([listOp("p1", { ...LIST, visibility: "private", shareId: "hidden000001" }), listOp("d1", { ...LIST, shareId: "gone00000001", deleted: true })]);
  for (const path of ["/api/s/hidden000001", "/api/s/gone00000001", "/api/s/nope00000001", "/api/s/not-an-id"]) {
    expect((await w.call("GET", path)).status).toBe(404);
  }
  // Making a shared list private again stops the link at once
  await sync([listOp("l2", { ...LIST, shareId: "second000001" })]);
  expect((await w.call("GET", "/api/s/second000001")).status).toBe(200);
  await sync([listOp("l2", { visibility: "private" })]);
  expect((await w.call("GET", "/api/s/second000001")).status).toBe(404);
});

test("LIST-13: share pages get a title and a link preview, escaped", async () => {
  await sync([listOp("l3", { ...LIST, shareId: "third0000001" }), { id: `op-${++n}`, type: "item", listId: "l3", appid: 620, at: 1, set: { position: "a", deleted: false } }]);
  const html = await (await w.call("GET", "/l/third0000001")).text();
  expect(html).toContain("<title>Up &lt;next&gt; · Dev user</title>");
  expect(html).toContain(`<meta property="og:description" content="1 game · 0 h">`);
  expect(html).toContain("/apps/620/header.jpg");
  expect(await (await w.call("GET", "/l/nope00000001")).text()).toBe(INDEX);
  expect(await (await w.call("GET", "/s/third0000001")).text()).toContain("og:title"); // older links
});

test("LIST-15: the whole backlog, when the profile shows it", async () => {
  await sync([{ id: `op-${++n}`, type: "game", appid: 400, at: 1, set: { status: "finished", note: "secret", my: { main: null, main_extra: 4, comp: null }, myKind: "exact" } }]);
  await w.call("POST", "/api/profile", { handle, public: true });
  expect((await w.call("GET", `/api/u/${handle}/backlog`)).status).toBe(404); // not shown by default
  await w.call("POST", "/api/profile", { showBacklog: true });
  w.signOut();
  const res = await w.call("GET", `/api/u/${handle}/backlog`);
  const data = (await res.json()) as SharedList;
  expect(data.list.title).toBe("Backlog");
  expect(data.games.map(g => g.name)).toEqual(["Portal", "Half-Life 2", "Portal 2", "Stardew Valley", "Terraria"]); // shortest first, unknown after
  expect(JSON.stringify(data)).not.toContain("secret");
  expect((await w.call("GET", `/api/u/${handle}/backlog`, undefined, { "if-none-match": res.headers.get("etag")! })).status).toBe(304);
  const p = (await (await w.call("GET", `/api/u/${handle}`)).json()) as Profile;
  expect(p.backlog).toEqual({ games: 4, hours: 9, covers: [220, 620, 413150, 105600] }); // Half-Life 2 got 9 h in an earlier test
  expect(await (await w.call("GET", `/u/${handle}/backlog`)).text()).toContain("<title>Dev user's backlog</title>");
});
