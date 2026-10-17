import { MIN_COUNT } from "@backlog/shared/lengths";
import type { Entry } from "@backlog/shared/filter";
import type { Measure } from "@backlog/shared/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const MEASURE_NAME: Record<Measure, string> = { main: "Main story", main_extra: "Main + Extras" };

/** Why a length is shown as approximate, for the badge tooltip and the detail panel; null when it isn't. */
export function approxReason({ game: g, len }: Entry, measure: Measure): string | null {
  if (!len.approx) return null;
  if (len.source === "mine") return g.myKind === "approx" ? "Your rough guess" : `No ${MEASURE_NAME[measure]} time, using another measure`;
  if (len.lengths && len.lengths[measure] == null) return `No ${MEASURE_NAME[measure]} time, using another measure`;
  if (len.source === "igdb" && (g.igdb?.count ?? 0) < MIN_COUNT) return `IGDB, only ${plural(g.igdb?.count ?? 0, "submission")}`;
  if (len.source === "community") return `Community, only ${plural(g.community?.count ?? 0, "entry").replace("entrys", "entries")}`;
  return "Approximate";
}
