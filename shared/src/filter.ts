import type { Resolved } from "./lengths.ts";
import { normalizeName } from "./names.ts";
import type { Game, Status } from "./types.ts";

/** A saved or current filter. The same JSON is used for smart views and filter lists (TECH.md §9). */
export type Filter = {
  statuses?: Status[];
  q?: string;
  minHours?: number;
  maxHours?: number;
  played?: "any" | "played" | "never";
  needsLength?: boolean;
  addedAfter?: number;
  addedBefore?: number;
};

export type SortKey = "length" | "name" | "added" | "playtime" | "changed";
export const SORT_LABEL: Record<SortKey, string> = {
  length: "Length", name: "Name", added: "Date added", playtime: "Playtime", changed: "Recently changed",
};

export type Entry = { game: Game; len: Resolved; key: string };

/** `key` is the normalized name, precomputed so search doesn't normalize on every keystroke. */
export function matches(e: Entry, f: Filter): boolean {
  const { game: g, len } = e;
  if (f.statuses?.length && !f.statuses.includes(g.status)) return false;
  if (f.q) {
    const q = normalizeName(f.q);
    if (q && !e.key.includes(q)) return false;
  }
  if (f.needsLength && (len.hours != null || len.endless)) return false;
  if (f.minHours != null && !(len.hours != null && len.hours >= f.minHours)) return false;
  if (f.maxHours != null && !(len.hours != null && len.hours < f.maxHours)) return false;
  if (f.played === "played" && g.playtimeMin <= 0) return false;
  if (f.played === "never" && g.playtimeMin > 0) return false;
  if (f.addedAfter != null && g.addedAt < f.addedAfter) return false;
  if (f.addedBefore != null && g.addedAt >= f.addedBefore) return false;
  return true;
}

const byName = (a: Entry, b: Entry) => a.game.name.localeCompare(b.game.name);

/** Length sort puts unknown and endless games last; ties fall back to name. */
export function compare(key: SortKey): (a: Entry, b: Entry) => number {
  switch (key) {
    case "length":
      return (a, b) => (a.len.hours == null ? 1 : 0) - (b.len.hours == null ? 1 : 0) || (a.len.hours ?? 0) - (b.len.hours ?? 0) || byName(a, b);
    case "name": return byName;
    case "added": return (a, b) => b.game.addedAt - a.game.addedAt || byName(a, b);
    case "playtime": return (a, b) => b.game.playtimeMin - a.game.playtimeMin || byName(a, b);
    case "changed": return (a, b) => (b.game.statusAt ?? 0) - (a.game.statusAt ?? 0) || byName(a, b);
  }
}
