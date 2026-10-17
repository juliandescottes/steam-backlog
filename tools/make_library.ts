/*
 * Build files the app can open from the prototype's data (until Steam import exists, milestone 3):
 *   tools/out/library.json       the collection, with IGDB lengths when tools/igdb_results.json exists
 *   tools/out/hltb_lengths.json  HLTB times, to bring in as your own lengths (Settings → Import lengths)
 *
 * Usage: npm run library   (or: node tools/make_library.ts)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, type LengthsFile, type LibraryFile, type LibraryGame } from "../shared/src/files.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

// Same as WRONG in build.py: fuzzy HLTB matches checked by hand and found to be a different game
const WRONG: Record<string, string[]> = {
  "Total War: ROME II - Emperor Edition": ["Rome: Total War"],
  "Total War: NAPOLEON – Definitive Edition": ["Total War: Empire - Definitive Edition"],
};

type IgdbLengths = { main: number | null; main_extra: number | null; completionist: number | null; count: number | null };
type IgdbResult = { appid: number; igdb: IgdbLengths | null; parent?: { by: string; lengths: IgdbLengths | null } | null };

const rows = parseCsv(readFileSync(join(HERE, "hltb_20_-_Not_started.csv"), "utf8"));
const hltb: Record<string, any> = JSON.parse(readFileSync(join(HERE, "hltb_results.json"), "utf8"));
const igdbFile = join(HERE, "igdb_results.json");
const igdb = new Map<number, IgdbResult>(
  existsSync(igdbFile) ? JSON.parse(readFileSync(igdbFile, "utf8")).map((r: IgdbResult) => [r.appid, r]) : [],
);
if (!igdb.size) console.warn("No tools/igdb_results.json: the library will have no IGDB lengths (run tools/igdb_coverage.ts first).");

const hasTime = (l: IgdbLengths | null | undefined): l is IgdbLengths => !!l && (l.main ?? l.main_extra ?? l.completionist) != null;
const toLengths = (l: IgdbLengths) => ({ main: l.main, main_extra: l.main_extra, comp: l.completionist, count: l.count });

const games: LibraryGame[] = rows.map(r => {
  const appid = Number(r.steam_appid);
  const name = r.game.startsWith("<unknown app") ? `Steam app ${appid}` : r.game;
  const i = igdb.get(appid);
  // The app follows version_parent only (TECH.md §8)
  const l = hasTime(i?.igdb) ? i.igdb : i?.parent?.by === "version_parent" && hasTime(i.parent.lengths) ? i.parent.lengths : null;
  return { appid, name, igdb: l ? toLengths(l) : null };
});

const lengths: LengthsFile["lengths"] = [];
for (const r of rows) {
  const h = hltb[r.steam_appid];
  if (!h?.match || (WRONG[r.game] ?? []).includes(h.match)) continue;
  if ((h.main ?? h.main_extra ?? h.completionist) == null) continue;
  lengths.push({ appid: Number(r.steam_appid), main: h.main ?? null, main_extra: h.main_extra ?? null, completionist: h.completionist ?? null });
}

mkdirSync(OUT, { recursive: true });
const library: LibraryFile = { format: "backlog-library", version: 1, games };
const lengthsFile: LengthsFile = { format: "backlog-lengths", version: 1, lengths };
writeFileSync(join(OUT, "library.json"), JSON.stringify(library));
writeFileSync(join(OUT, "hltb_lengths.json"), JSON.stringify(lengthsFile));
console.log(`tools/out/library.json: ${games.length} games, ${games.filter(g => g.igdb).length} with IGDB lengths`);
console.log(`tools/out/hltb_lengths.json: ${lengths.length} HLTB lengths`);
