import { openDB, type IDBPDatabase } from "idb";
import type { Op } from "@backlog/shared/sync";
import type { List, ListItem } from "@backlog/shared/lists";
import type { Game } from "@backlog/shared/types";
import type { View } from "@backlog/shared/views";

/** IndexedDB persistence. The store keeps everything in memory; this only saves and restores it. */
let dbp: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbp ??= openDB("backlog", 4, {
    upgrade(d, old) {
      if (old < 1) {
        d.createObjectStore("games", { keyPath: "appid" });
        d.createObjectStore("meta");
      }
      if (old < 2) d.createObjectStore("outbox", { keyPath: "id" });
      if (old < 3) d.createObjectStore("views", { keyPath: "id" });
      if (old < 4) {
        d.createObjectStore("lists", { keyPath: "id" });
        d.createObjectStore("listItems", { keyPath: ["listId", "appid"] });
      }
    },
  }));

export async function loadGames(): Promise<Game[]> {
  return (await db()).getAll("games");
}

export async function loadViews(): Promise<View[]> {
  return (await db()).getAll("views");
}

export async function putView(v: View): Promise<void> {
  await (await db()).put("views", v);
}

export async function replaceViews(views: View[]): Promise<void> {
  const tx = (await db()).transaction("views", "readwrite");
  await Promise.all([tx.store.clear(), ...views.map(v => tx.store.put(v)), tx.done]);
}

export async function deleteView(id: string): Promise<void> {
  await (await db()).delete("views", id);
}

export async function loadLists(): Promise<{ lists: List[]; items: ListItem[] }> {
  const d = await db();
  const [lists, items] = await Promise.all([d.getAll("lists"), d.getAll("listItems")]);
  return { lists, items };
}

/** Writes lists and items; `removed` items are deleted. With `replace`, everything else goes. */
export async function saveLists(lists: List[], items: ListItem[], removed: ListItem[] = [], deletedLists: string[] = [], replace = false) {
  const tx = (await db()).transaction(["lists", "listItems"], "readwrite");
  const [ls, is] = [tx.objectStore("lists"), tx.objectStore("listItems")];
  if (replace) await Promise.all([ls.clear(), is.clear()]);
  await Promise.all([
    ...lists.map(l => ls.put(l)), ...deletedLists.map(id => ls.delete(id)),
    ...items.map(i => is.put(i)), ...removed.map(i => is.delete([i.listId, i.appid])),
    tx.done,
  ]);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put("meta", value, key);
}

// Writes are coalesced so a burst of changes (bulk actions, image loads) is one transaction.
const pending = new Map<number, Game>();
let scheduled = false;

export function saveGames(games: Iterable<Game>): void {
  for (const g of games) pending.set(g.appid, g);
  if (scheduled) return;
  scheduled = true;
  setTimeout(flush, 0);
}

async function flush() {
  scheduled = false;
  const batch = [...pending.values()];
  pending.clear();
  const tx = (await db()).transaction("games", "readwrite");
  await Promise.all([...batch.map(g => tx.store.put(g)), tx.done]);
}

export async function replaceGames(games: Iterable<Game>): Promise<void> {
  pending.clear();
  const tx = (await db()).transaction("games", "readwrite");
  await Promise.all([tx.store.clear(), ...[...games].map(g => tx.store.put(g)), tx.done]);
}

/** Ops not yet acknowledged by the server, oldest first. */
export async function loadOutbox(): Promise<Op[]> {
  return (await db()).getAll("outbox"); // ids sort by creation (see newOpId)
}

export async function addOps(ops: Op[]): Promise<void> {
  const tx = (await db()).transaction("outbox", "readwrite");
  await Promise.all([...ops.map(o => tx.store.put(o)), tx.done]);
}

export async function removeOps(ids: string[]): Promise<void> {
  const tx = (await db()).transaction("outbox", "readwrite");
  await Promise.all([...ids.map(id => tx.store.delete(id)), tx.done]);
}

export async function clearAll(): Promise<void> {
  pending.clear();
  const d = await db();
  await Promise.all([d.clear("games"), d.clear("meta"), d.clear("outbox"), d.clear("views"), d.clear("lists"), d.clear("listItems")]);
}
