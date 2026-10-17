import { signal } from "@preact/signals";
import type { Op, SyncResponse } from "@backlog/shared/sync";
import * as db from "./db.ts";
import { applyServerGames, deleteEverything, games, listenUserChanges, showToast, type UserChange } from "./store.ts";

/** Account, Steam import and background sync (TECH.md §5, §7). Without an account the app stays local-only. */

export type Me = { id: string; steamId: string; handle: string | null; name: string; avatar: string | null; librarySyncedAt: number | null; shareLengths: boolean };
type Cursor = { since: number; catalogSince: number };

export const account = signal<Me | null>(null);
/** Steam library import, shown full screen on first sign-in. */
export const importing = signal<null | "running" | "private" | "failed">(null);

const DAY = 24 * 60 * 60 * 1000;
const MAX_OPS = 5000;

let outbox: Op[] = [];
let opSeq = 0;
/** Sortable: IndexedDB returns the outbox in id order, which is creation order. */
const newOpId = (at: number) => `${at.toString(36).padStart(9, "0")}-${(opSeq++).toString(36).padStart(4, "0")}-${crypto.randomUUID().slice(0, 8)}`;

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

async function api<T>(method: string, path: string, data?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "x-requested-with": "backlog", ...(data === undefined ? {} : { "content-type": "application/json" }) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "http_error");
  return res.json() as Promise<T>;
}

export const signIn = () => location.assign("/api/auth/steam");

/** Restores the cached account, then checks the session. Offline or without a backend, the app keeps working locally. */
export async function initAccount() {
  const cached = (await db.getMeta<Me>("account")) ?? null;
  account.value = cached;
  outbox = await db.loadOutbox();
  listenUserChanges(record);

  // Sync starts only once the session is known to be the cached account's (or the network is down)
  let me: Me;
  try {
    me = await api<Me>("GET", "/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && cached) {
      showToast("Signed out on this device. Sign in again to sync.");
      account.value = null;
    } else if (cached) startSync();
    return;
  }
  if (cached && cached.id !== me.id) { // another account used this browser
    await deleteEverything();
    outbox = [];
  }
  account.value = me;
  await db.setMeta("account", me);
  if (!cached || cached.id !== me.id) return firstSync();
  startSync();
  if (!me.librarySyncedAt || Date.now() - me.librarySyncedAt > DAY) void refreshLibrary(true);
}

/**
 * First sign-in on this device: what the user did locally becomes ops (games they own on Steam pick it up),
 * then the account's library replaces the local one.
 */
async function firstSync() {
  const local = [...games.value.values()].filter(g => g.status !== "backlog" || g.note || g.myKind);
  record(local.map(g => ({ appid: g.appid, set: { status: g.status, statusAt: g.statusAt, finishedAt: g.finishedAt, note: g.note, my: g.my, myKind: g.myKind } })), false);
  importing.value = "running";
  try {
    await api("POST", "/library/refresh");
  } catch (e) {
    importing.value = e instanceof ApiError && e.code === "profile_private" ? "private" : "failed";
    return;
  }
  if (!(await syncNow(true))) {
    importing.value = "failed";
    return;
  }
  importing.value = null;
  startSync();
}

export async function retryImport() {
  await firstSync();
}

/** Picks up games bought since the last import. */
export async function refreshLibrary(quiet = false) {
  try {
    const r = await api<{ added: number }>("POST", "/library/refresh");
    await syncNow();
    if (!quiet) showToast(r.added ? `${r.added} new game${r.added === 1 ? "" : "s"} from Steam` : "Library is up to date");
  } catch (e) {
    if (!quiet) showToast(e instanceof ApiError && e.code === "profile_private" ? "Steam says your game details are private" : "Couldn't reach Steam. Try again later.");
  }
}

export async function setShareLengths(shareLengths: boolean) {
  const before = account.value;
  if (!before) return;
  account.value = { ...before, shareLengths };
  try {
    await api("POST", "/settings", { shareLengths });
    await db.setMeta("account", account.value);
  } catch {
    account.value = before;
    showToast("Couldn't save. Try again when online.");
  }
}

function record(changes: UserChange[], schedule = true) {
  if (!account.value || !changes.length) return;
  const at = Date.now();
  const ops = changes.map((c): Op => ({ id: newOpId(at), type: "game", appid: c.appid, at, set: c.set }));
  outbox.push(...ops);
  void db.addOps(ops);
  if (schedule) scheduleSync();
}

let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync(delay = 1000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncNow(); }, delay);
}

let started = false;
function startSync() {
  if (started) return;
  started = true;
  void syncNow();
  window.addEventListener("focus", () => void syncNow());
  window.addEventListener("online", () => void syncNow());
  setInterval(() => void syncNow(), 5 * 60 * 1000);
}

let running: Promise<boolean> | null = null;
let again = false;
let replaceNext = false;

/**
 * Sends the outbox and applies what changed on the server. Resolves false when it couldn't sync.
 * `replace` asks for the whole library, replacing the local one; it runs even when a sync is in flight.
 */
export function syncNow(replace = false): Promise<boolean> {
  replaceNext ||= replace;
  if (running) { again = true; return running; }
  running = (async () => {
    let ok = true;
    do {
      again = false;
      const full = replaceNext;
      replaceNext = false;
      ok = await syncOnce(full);
    } while ((again || replaceNext) && ok);
    running = null;
    return ok;
  })();
  return running;
}

async function syncOnce(replace: boolean): Promise<boolean> {
  const who = account.value?.id;
  if (!who) return false;
  // A full sync when asked, and to repair a signed-in browser that lost its games
  const cursor = replace || !games.value.size ? { since: 0, catalogSince: 0 }
    : (await db.getMeta<Cursor>("cursor")) ?? { since: 0, catalogSince: 0 };
  const sent = outbox.slice(0, MAX_OPS);
  let r: SyncResponse;
  try {
    r = await api<SyncResponse>("POST", "/sync", { ...cursor, ops: sent });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      account.value = null;
      showToast("Signed out on this device. Sign in again to sync.");
    }
    return false;
  }
  if (account.value?.id !== who) return false; // signed out or switched while this was in flight
  const done = new Set(sent.map(o => o.id));
  outbox = outbox.filter(o => !done.has(o.id));
  await db.removeOps([...done]);
  applyServerGames(r.games, outbox, replace);
  await db.setMeta("cursor", { since: r.rev, catalogSince: r.catalogAt } satisfies Cursor);
  if (outbox.length) again = true;
  return true;
}

/** Signs out after a last sync, then clears this browser: the data lives in the account. */
export async function signOut() {
  if (outbox.length) await syncNow();
  if (outbox.length) {
    showToast("Some changes haven't synced yet. Try again when you're online.");
    return;
  }
  await api("POST", "/auth/logout").catch(() => {});
  account.value = null;
  await deleteEverything();
}
