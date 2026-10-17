import type { Filter, SortKey } from "./filter.ts";

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
  /** The id in the list's address (/l/<shareId>): random, made with the list, never changed. */
  shareId: string;
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

export const SHARE_ID = /^[0-9a-z]{12}$/;

/** 12 random base-36 characters: about 62 bits, so ids made offline on different devices don't collide. */
export function newShareId(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))].map(b => DIGITS[b % 36]).join("");
}
