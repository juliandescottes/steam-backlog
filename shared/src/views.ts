import { STATUSES } from "./types.ts";
import type { Filter, SortKey } from "./filter.ts";

/** A smart view: a named filter and sort (SPEC §6). Built-in ones have ids starting with "builtin:". */
export type View = { id: string; name: string; filter: Filter; sort: SortKey; position: string };

/** The filter without empty or default fields, statuses in a fixed order: two filters that show the same games compare equal. */
export function canonical(f: Filter): Filter {
  const out: Filter = {};
  if (f.statuses?.length && f.statuses.length < STATUSES.length) out.statuses = STATUSES.filter(s => f.statuses!.includes(s));
  if (f.played && f.played !== "any") out.played = f.played;
  if (f.q?.trim()) out.q = f.q.trim();
  if (f.needsLength) out.needsLength = true;
  for (const k of ["minHours", "maxHours", "addedAfter", "addedBefore", "finishedAfter", "finishedBefore"] as const) {
    if (f[k] != null) out[k] = f[k];
  }
  return out;
}

export const sameView = (a: Pick<View, "filter" | "sort">, b: Pick<View, "filter" | "sort">) =>
  a.sort === b.sort && JSON.stringify(canonical(a.filter)) === JSON.stringify(canonical(b.filter));

/** Built-in views; "Finished in <year>" follows the current year. */
export function builtInViews(now = new Date()): View[] {
  const year = now.getFullYear();
  const open: Filter = { statuses: ["backlog", "playing"] };
  const views: Omit<View, "position">[] = [
    { id: "builtin:to-play", name: "To play", filter: open, sort: "length" },
    { id: "builtin:short", name: "Under 5 h", filter: { ...open, maxHours: 5 }, sort: "length" },
    { id: "builtin:never", name: "Never launched", filter: { ...open, played: "never" }, sort: "length" },
    { id: "builtin:needs-length", name: "Needs a length", filter: { ...open, needsLength: true }, sort: "playtime" },
    { id: "builtin:finished-year", name: `Finished in ${year}`, sort: "changed",
      filter: { statuses: ["finished"], finishedAfter: new Date(year, 0, 1).getTime(), finishedBefore: new Date(year + 1, 0, 1).getTime() } },
  ];
  return views.map((v, i) => ({ ...v, position: String(i) }));
}
