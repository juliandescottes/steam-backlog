import type { Resolved } from "./lengths.ts";

export type Band = { id: string; label: string; max: number | null; color: string; guess: number | null };

/** Length bands, shortest first. `guess` is the value stored for a rough guess in that band (TECH.md §8). */
export const BANDS: Band[] = [
  { id: "under-3", label: "Under 3 h", max: 3, color: "--b0", guess: 2 },
  { id: "3-6", label: "3 to 6 h", max: 6, color: "--b1", guess: 4.5 },
  { id: "6-10", label: "6 to 10 h", max: 10, color: "--b2", guess: 8 },
  { id: "10-20", label: "10 to 20 h", max: 20, color: "--b3", guess: 15 },
  { id: "20-40", label: "20 to 40 h", max: 40, color: "--b4", guess: 30 },
  { id: "40-80", label: "40 to 80 h", max: 80, color: "--b5", guess: 60 },
  { id: "80-plus", label: "80 h and up", max: Infinity, color: "--b6", guess: 100 },
  { id: "no-ending", label: "No ending", max: null, color: "--bend", guess: null },
  { id: "unknown", label: "Unknown", max: null, color: "--bnone", guess: null },
];
export const TIMED_BANDS = BANDS.slice(0, 7);
export const ENDLESS_BAND = BANDS[7];
export const UNKNOWN_BAND = BANDS[8];

export function bandOf(r: Resolved): Band {
  if (r.endless) return ENDLESS_BAND;
  if (r.hours == null) return UNKNOWN_BAND;
  return TIMED_BANDS.find(b => r.hours! < b.max!)!;
}

/** Hours rounded to a quarter, as decimals ("1.75h"), with a floor of 0.25 h. */
export function roundHours(h: number): number {
  return Math.max(0.25, Math.round(h * 4) / 4);
}

/** Below this, quarter hours matter ("1.75h"); above it, whole hours read better ("113h"). */
export const PRECISE_BELOW = 3;

/**
 * Hours for display. Quarters under 3 h, whole hours above, unless `precise` asks for the stored
 * quarter-hour value (detail panel, input preview).
 */
export function formatHours(h: number | null | undefined, approx = false, precise = false): string {
  if (h == null) return "–";
  const shown = precise || h < PRECISE_BELOW ? roundHours(h) : Math.round(h);
  return `${approx ? "~" : ""}${shown}h`;
}
