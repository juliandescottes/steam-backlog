import { roundHours } from "./bands.ts";
import type { Lengths } from "./types.ts";

export type ParsedLength =
  | { kind: "single"; hours: number }
  | { kind: "block"; lengths: Lengths };

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
const NUM = String.raw`(\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔])`;
const UNIT = String.raw`(hours?|hrs?|h|minutes?|mins?|m)?`;

function number(s: string): number {
  s = s.replace(/\s+/g, "");
  const frac = FRACTIONS[s.at(-1)!] ?? 0;
  const whole = frac ? s.slice(0, -1) : s;
  return (whole ? Number(whole.replace(",", ".")) : 0) + frac;
}

function withUnit(n: number, unit: string | undefined): number {
  return unit && /^m/.test(unit) ? n / 60 : n;
}

const round = (h: number | null) => (h == null || !(h > 0) ? null : roundHours(h));

/**
 * Parse what someone types or pastes as a game length.
 * Single values: "12", "12.5", "12,5", "12½", "12h30", "12:30", "12 h", "45m", "45 mins".
 * Blocks copied from a game page: "Main Story 8 Hours Main + Extras 12½ Hours Completionist 20 Hours"
 * ("Main + Sides" is accepted too; "--" means no time).
 */
export function parseLengthInput(input: string): ParsedLength | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;

  if (/main|completionist/.test(s)) {
    const grab = (label: string) => {
      const m = s.match(new RegExp(label + String.raw`\s*[:\-–]?\s*` + NUM + String.raw`\s*` + UNIT));
      return m ? round(withUnit(number(m[1]), m[2])) : null;
    };
    const lengths = {
      main: grab(String.raw`main story`),
      main_extra: grab(String.raw`main\s*\+\s*(?:extras?|sides?)`),
      comp: grab(String.raw`completionist`),
    };
    return lengths.main ?? lengths.main_extra ?? lengths.comp ? { kind: "block", lengths } : null;
  }

  let m = s.match(/^(\d+)\s*(?:h|:)\s*(\d{1,2})\s*m?$/); // 12h30, 12:30
  if (m) return single(Number(m[1]) + Number(m[2]) / 60);
  m = s.match(new RegExp(`^${NUM}\\s*${UNIT}$`));
  if (m) return single(withUnit(number(m[1]), m[2]));
  return null;
}

function single(h: number): ParsedLength | null {
  const hours = round(h);
  return hours == null ? null : { kind: "single", hours };
}
