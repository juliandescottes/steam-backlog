import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { ListOp, Op, SyncResponse } from "@backlog/shared/sync";
import type { SharedList } from "@backlog/shared/share";
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
const LIST = { title: "Up <next>", description: "", kind: "manual", filter: null, sort: null, slug: "up-next", visibility: "link", position: "i", deleted: false } as const;
let handle = "";

/** A signed-in user with the dev library (Portal 400, Portal 2 620, Half-Life 2 220, Terraria 105600, Stardew 413150) and a handle. */
beforeEach(async () => {
  await w.call("POST", "/api/auth/dev", { steamId: `76561190${String(++n).padStart(9, "0")}` });
  await w.call("POST", "/api/library/refresh");
  handle = `player-${n}`;
  expect((await w.call("POST", "/api/handle", { handle })).status).toBe(200);
});

test("handles: valid, unique", async () => {
  expect((await w.call("POST", "/api/handle", { handle: "Bad Name" })).status).toBe(400);
  expect((await w.call("POST", "/api/handle", { handle: "-x" })).status).toBe(400);
  const mine = handle;
  await w.call("POST", "/api/auth/dev", { steamId: "76561190999999999" });
  const taken = await w.call("POST", "/api/handle", { handle: mine });
  expect(taken.status).toBe(409);
  expect(await taken.json()).toEqual({ error: "handle_taken" });
});

test("a shared list: games in order with lengths and status, nothing private; 304 until something changes", async () => {
  await sync([
    listOp("l1", LIST),
    { id: `op-${++n}`, type: "item", listId: "l1", appid: 220, at: 1, set: { position: "a", deleted: false } },
    { id: `op-${++n}`, type: "item", listId: "l1", appid: 400, at: 1, set: { position: "b", deleted: false } },
    { id: `op-${++n}`, type: "game", appid: 400, at: 1, set: { status: "finished", statusAt: 5, finishedAt: 5, note: "secret", my: { main: 3, main_extra: 4, comp: null }, myKind: "exact" } },
  ]);
  w.signOut(); // viewers don't need an account
  const res = await w.call("GET", `/api/u/${handle}/l/up-next`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as SharedList;
  expect(data.owner).toEqual({ handle, name: "Dev user", avatar: null });
  expect(data.list).toEqual({ title: "Up <next>", description: "", kind: "manual", sort: null });
  expect(data.games.map(g => g.name)).toEqual(["Half-Life 2", "Portal"]);
  expect(data.games[1]).toMatchObject({ status: "finished", my: { main: 3, main_extra: 4, comp: null }, note: "", playtimeMin: 0, lastPlayedAt: null, finishedAt: null });
  expect(JSON.stringify(data)).not.toContain("secret");

  const etag = res.headers.get("etag")!;
  expect((await w.call("GET", `/api/u/${handle}/l/up-next`, undefined, { "if-none-match": etag })).status).toBe(304);
  await w.env.DB.prepare("UPDATE games SET igdb_main = 9, updated_at = updated_at + 1 WHERE appid = 220").run();
  expect((await w.call("GET", `/api/u/${handle}/l/up-next`, undefined, { "if-none-match": etag })).status).toBe(200);
});

test("filter lists are computed for viewers", async () => {
  await sync([
    listOp("f1", { ...LIST, kind: "filter", filter: { played: "never" }, sort: "name", slug: "never" }),
  ]);
  const data = (await (await w.call("GET", `/api/u/${handle}/l/never`)).json()) as SharedList;
  expect(data.games.map(g => g.name)).toEqual(["Portal 2", "Stardew Valley"]);
});

test("private, deleted and missing lists are all 404", async () => {
  await sync([listOp("p1", { ...LIST, visibility: "private", slug: "hidden" }), listOp("d1", { ...LIST, slug: "gone", deleted: true })]);
  for (const path of [`/api/u/${handle}/l/hidden`, `/api/u/${handle}/l/gone`, `/api/u/${handle}/l/nope`, "/api/u/nobody/l/up-next"]) {
    expect((await w.call("GET", path)).status).toBe(404);
  }
  // Making a shared list private again stops the link at once
  await sync([listOp("l2", LIST)]);
  expect((await w.call("GET", `/api/u/${handle}/l/up-next`)).status).toBe(200);
  await sync([listOp("l2", { visibility: "private" })]);
  expect((await w.call("GET", `/api/u/${handle}/l/up-next`)).status).toBe(404);
});

test("share pages get a title and a link preview, escaped", async () => {
  await sync([listOp("l3", LIST), { id: `op-${++n}`, type: "item", listId: "l3", appid: 620, at: 1, set: { position: "a", deleted: false } }]);
  const html = await (await w.call("GET", `/u/${handle}/l/up-next`)).text();
  expect(html).toContain("<title>Up &lt;next&gt; · Dev user</title>");
  expect(html).toContain(`<meta property="og:description" content="1 game · 0 h">`);
  expect(html).toContain("/apps/620/header.jpg");
  expect(await (await w.call("GET", `/u/${handle}/l/nope`)).text()).toBe(INDEX);
});
