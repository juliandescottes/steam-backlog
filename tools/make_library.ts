/*
 * Build files the app can open from the prototype's data (until Steam import exists, milestone 3):
 *   tools/out/library.json       the collection, with IGDB lengths when tools/igdb_results.json exists
 *
 * Usage: npm run library   (or: node tools/make_library.ts)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, type LibraryFile, type LibraryGame } from "../shared/src/files.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

type IgdbLengths = { main: number | null; main_extra: number | null; completionist: number | null; count: number | null };
type IgdbResult = { appid: number; igdb: IgdbLengths | null; parent?: { by: string; lengths: IgdbLengths | null } | null };

const rows = parseCsv(readFileSync(join(HERE, "hltb_20_-_Not_started.csv"), "utf8"));
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

mkdirSync(OUT, { recursive: true });
const library: LibraryFile = { format: "backlog-library", version: 1, games };
writeFileSync(join(OUT, "library.json"), JSON.stringify(library));
console.log(`tools/out/library.json: ${games.length} games, ${games.filter(g => g.igdb).length} with IGDB lengths`);
