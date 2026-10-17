import { normalizeName } from "./names.ts";

/**
 * How well a normalized query matches a normalized name, for the command palette (TECH.md §4):
 * 3 prefix, 2 word start, 1 anywhere, -1 no match.
 */
export function matchScore(q: string, key: string): number {
  if (!q) return 0;
  const first = key.indexOf(q);
  if (first < 0) return -1;
  if (first === 0) return 3;
  for (let i = first; i >= 0; i = key.indexOf(q, i + 1)) if (key[i - 1] === " ") return 2;
  return 1;
}

/** The best `limit` items for a query: higher score first, then shorter names. */
export function rank<T>(query: string, items: T[], keyOf: (item: T) => string, limit: number): T[] {
  const q = normalizeName(query);
  const scored: { item: T; score: number; len: number }[] = [];
  for (const item of items) {
    const key = keyOf(item);
    const score = matchScore(q, key);
    if (score >= 0) scored.push({ item, score, len: key.length });
  }
  return scored.sort((a, b) => b.score - a.score || a.len - b.len).slice(0, limit).map(s => s.item);
}
