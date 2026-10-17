import type { Filter, SortKey } from "./filter.ts";
import { normalizeName } from "./names.ts";

/** Hand-picked games in your order, or the games a filter matches, kept up to date (SPEC §7). */
export type ListKind = "manual" | "filter";
export type Visibility = "private" | "link" | "profile";
export type List = {
  id: string;
  title: string;
  description: string;
  kind: ListKind;
  /** Filter lists only. */
  filter: Filter | null;
  sort: SortKey | null;
  slug: string;
  visibility: Visibility;
  position: string;
};

/** A game in a hand-picked list; lists show items by `position`. */
export type ListItem = { listId: string; appid: number; position: string };

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * A position key sorting strictly between `a` and `b` (null: no bound), so moving one game rewrites one row.
 * Keys are base-36 fractions and never end in "0", which leaves room below every key.
 */
export function between(a: string | null, b: string | null): string {
  if (a != null && b != null && a >= b) throw new Error(`between: ${a} >= ${b}`);
  let out = "";
  for (let i = 0; ; i++) {
    const lo = a != null && i < a.length ? DIGITS.indexOf(a[i]) : 0;
    const hi = b != null && i < b.length ? DIGITS.indexOf(b[i]) : 36;
    if (hi - lo > 1) return out + DIGITS[(lo + hi) >> 1];
    out += DIGITS[lo];
    if (hi > lo) b = null; // out is now below b whatever follows
  }
}

/** `n` keys in order after `a`. */
export function after(a: string | null, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push((a = between(a, null)));
  return out;
}

/** "Best short games (2026)" → "best-short-games-2026". */
export function slugify(title: string): string {
  return normalizeName(title).replace(/ /g, "-").slice(0, 40).replace(/-+$/, "") || "list";
}

/** `base`, or `base-2`, `base-3`… when taken. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const t = new Set(taken);
  if (!t.has(base)) return base;
  for (let i = 2; ; i++) if (!t.has(`${base}-${i}`)) return `${base}-${i}`;
}
