import type { Game, Lengths, Measure } from "./types.ts";

export type LengthSource = "mine" | "community" | "igdb";

export type Resolved = {
  /** Hours for the chosen measure; null when unknown or endless. */
  hours: number | null;
  lengths: Lengths | null;
  source: LengthSource | null;
  approx: boolean;
  endless: boolean;
};

/** IGDB and community values with fewer entries than this are shown as approximate. */
export const MIN_COUNT = 3;

const UNKNOWN: Resolved = { hours: null, lengths: null, source: null, approx: false, endless: false };

/** The value for `measure`, falling back to the other measures (then flagged approximate). */
function pick(l: Lengths, measure: Measure): { hours: number | null; fallback: boolean } {
  const order: (keyof Lengths)[] = measure === "main" ? ["main", "main_extra", "comp"] : ["main_extra", "main", "comp"];
  for (const [i, k] of order.entries()) if (l[k] != null) return { hours: l[k], fallback: i > 0 };
  return { hours: null, fallback: false };
}

/** Which length to show for a game, in the order set by TECH.md §8. */
export function resolveLength(g: Game, measure: Measure): Resolved {
  if (g.myKind === "endless") return { ...UNKNOWN, source: "mine", endless: true };
  if (g.my) {
    const p = pick(g.my, measure);
    if (p.hours != null) return { hours: p.hours, lengths: g.my, source: "mine", approx: g.myKind === "approx" || p.fallback, endless: false };
  }

  const c = g.community;
  const igdbCount = g.igdb?.count ?? 0;
  if (c && c.endlessCount >= MIN_COUNT && c.endlessCount > c.count) return { ...UNKNOWN, source: "community", endless: true };
  const community = c?.main_extra != null
    ? { hours: c.main_extra, lengths: { main: null, main_extra: c.main_extra, comp: null }, source: "community" as const, endless: false }
    : null;
  if (community && c!.count >= MIN_COUNT && c!.count > igdbCount) return { ...community, approx: false };

  if (g.igdb) {
    const p = pick(g.igdb, measure);
    if (p.hours != null) {
      return { hours: p.hours, lengths: g.igdb, source: "igdb", approx: igdbCount < MIN_COUNT || p.fallback, endless: false };
    }
  }
  if (community) return { ...community, approx: true };
  return UNKNOWN;
}

export const SOURCE_LABEL: Record<LengthSource, string> = { mine: "Yours", community: "Community", igdb: "IGDB" };
