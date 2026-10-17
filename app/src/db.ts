import { openDB, type IDBPDatabase } from "idb";
import type { Game } from "@backlog/shared/types";

/** IndexedDB persistence. The store keeps everything in memory; this only saves and restores it. */
let dbp: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbp ??= openDB("backlog", 1, {
    upgrade(d) {
      d.createObjectStore("games", { keyPath: "appid" });
      d.createObjectStore("meta");
    },
  }));

export async function loadGames(): Promise<Game[]> {
  return (await db()).getAll("games");
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

export async function clearAll(): Promise<void> {
  pending.clear();
  const d = await db();
  await Promise.all([d.clear("games"), d.clear("meta")]);
}
