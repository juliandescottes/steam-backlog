import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { GameFields, SyncResponse } from "@backlog/shared/sync";
import { median } from "./community.ts";
import { testWorker } from "./testing.ts";

// Without a Steam API key, every dev sign-in imports the dev library: Portal (400) has 190 min of playtime
let w: Awaited<ReturnType<typeof testWorker>>;
beforeAll(async () => { w = await testWorker({ DEV_LOGIN: "true" }); });
afterAll(() => w.dispose());
beforeEach(async () => {
  await w.env.DB.prepare("DELETE FROM community_lengths").run();
  await w.env.DB.prepare("UPDATE games SET comm_main_extra = NULL, comm_count = 0, comm_endless_count = 0").run();
});

let users = 0, ops = 0;
async function newUser() {
  await w.call("POST", "/api/auth/dev", { steamId: `765611900000${String(++users).padStart(5, "0")}` });
  await w.call("POST", "/api/library/refresh");
}
async function set(appid: number, s: Partial<GameFields>): Promise<SyncResponse> {
  const op = { id: `op-${++ops}`, type: "game", appid, at: 1, set: s };
  return (await w.call("POST", "/api/sync", { since: 0, catalogSince: 0, ops: [op] })).json();
}
const typed = (h: number) => ({ my: { main: null, main_extra: h, comp: null }, myKind: "exact" as const });
const community = (r: SyncResponse, appid: number) => r.games.find(g => g.appid === appid)!.community;

test("LEN-15 LEN-16: typed lengths from three users become the game's community length", async () => {
  for (const h of [10, 12, 30]) { await newUser(); await set(620, typed(h)); }
  await newUser();
  const r: SyncResponse = await (await w.call("POST", "/api/sync", { since: 0, catalogSince: 0, ops: [] })).json();
  expect(community(r, 620)).toEqual({ main_extra: 12, count: 3, endlessCount: 0 });
});

test("LEN-15: rough guesses and imported lengths aren't shared", async () => {
  await newUser();
  await set(620, { my: { main: null, main_extra: 6, comp: null }, myKind: "approx" });
  const r = await set(220, { my: { main: 8, main_extra: 9, comp: 20 }, myKind: "imported" });
  expect(community(r, 620)).toBeNull();
  expect(community(r, 220)).toBeNull();
});

test("LEN-15: finishing a game shares its playtime; un-finishing takes it back", async () => {
  await newUser();
  expect(community(await set(400, { status: "finished", finishedAt: 1 }), 400)).toEqual({ main_extra: 3.25, count: 1, endlessCount: 0 });
  expect(community(await set(620, { status: "finished", finishedAt: 1 }), 620)).toBeNull(); // never launched
  expect(community(await set(400, { status: "playing" }), 400)).toBeNull();
});

test("a user counts once: a typed length wins over their playtime", async () => {
  await newUser();
  await set(400, { status: "finished", finishedAt: 1 });
  expect(community(await set(400, typed(5)), 400)).toEqual({ main_extra: 5, count: 1, endlessCount: 0 });
});

test("No ending counts separately", async () => {
  await newUser();
  await set(400, { status: "finished", finishedAt: 1 });
  expect(community(await set(400, { my: null, myKind: "endless" }), 400)).toEqual({ main_extra: null, count: 0, endlessCount: 1 });
});

test("LEN-15: turning sharing off removes the user's entries, and on brings them back", async () => {
  await newUser();
  expect(await (await w.call("GET", "/api/me")).json()).toMatchObject({ shareLengths: true });
  await set(620, typed(7));
  expect(await (await w.call("POST", "/api/settings", { shareLengths: false })).json()).toEqual({ shareLengths: false });
  expect(await (await w.call("GET", "/api/me")).json()).toMatchObject({ shareLengths: false });
  const off: SyncResponse = await (await w.call("POST", "/api/sync", { since: 0, catalogSince: 0, ops: [] })).json();
  expect(community(off, 620)).toBeNull();
  expect(community(await set(220, typed(9)), 220)).toBeNull();

  await w.call("POST", "/api/settings", { shareLengths: true });
  const on: SyncResponse = await (await w.call("POST", "/api/sync", { since: 0, catalogSince: 0, ops: [] })).json();
  expect(community(on, 620)?.main_extra).toBe(7);
  expect(community(on, 220)?.main_extra).toBe(9);
  expect((await w.call("POST", "/api/settings", { shareLengths: "no" })).status).toBe(400);
});

test("median", () => {
  expect(median([])).toBeNull();
  expect(median([4, 1, 3])).toBe(3);
  expect(median([1, 2])).toBe(1.5);
  expect(median([10, 11, 12, 500])).toBe(11.5);
});

test("DATA-3: deleting an account removes all its data and its community entries", async () => {
  await newUser();
  await set(620, typed(40));
  const steamId = `765611900000${String(users).padStart(5, "0")}`;
  expect((await w.call("DELETE", "/api/account")).headers.get("set-cookie")).toMatch(/^sid=;/);
  expect(await w.env.DB.prepare("SELECT count(*) AS n FROM users WHERE steam_id = ?").bind(steamId).first("n")).toBe(0);
  for (const t of ["user_games", "community_lengths", "sessions", "user_rev", "applied_ops"]) {
    expect(await w.env.DB.prepare(`SELECT count(*) AS n FROM ${t} t WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id)`).first("n")).toBe(0);
  }
  expect(await w.env.DB.prepare("SELECT comm_count FROM games WHERE appid = 620").first("comm_count")).toBe(0);
  expect((await w.call("GET", "/api/me")).status).toBe(401);
});
