/*
 * Length-source coverage check (milestone 0 in TECH.md).
 * For every game in the collection CSV, collect candidate lengths and compare them with the HLTB
 * times in hltb_results.json:
 *   - IGDB time-to-beat, via the Steam app ID (falling back to an exact name search)
 *   - IGDB time-to-beat of the game's parent when the game itself has none: the original of an
 *     edition or remaster (version_parent, parent_game), or the summed games of a bundle
 *   - SteamSpy median playtime of all owners (a rough proxy)
 *
 * Usage: TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... node tools/igdb_coverage.ts
 * Needs Node 23.6+ (runs TypeScript directly). Writes igdb_results.json next to this script, and
 * caches SteamSpy responses in steamspy_cache.json (the first run takes ~6 min at 1 request/s).
 * Credentials: register an application at https://dev.twitch.tv/console/apps.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STEAM_SOURCE = 1; // IGDB external game source id for Steam
const BATCH = 500; // IGDB's max results per query
const PAUSE_MS = 300; // IGDB allows 4 requests per second
const STEAMSPY_PAUSE_MS = 1000; // SteamSpy allows 1 appdetails request per second
const LOW_COUNT = 3; // IGDB times with fewer submissions are reported separately

// Same as WRONG in build.py: fuzzy HLTB matches checked by hand and found to be a different game
const WRONG: Record<string, string[]> = {
  "Total War: ROME II - Emperor Edition": ["Rome: Total War"],
  "Total War: NAPOLEON – Definitive Edition": ["Total War: Empire - Definitive Edition"],
};

// Upper bounds of the length bands in template.html
const BAND_MAX = [3, 6, 10, 20, 40, 80, Infinity];
const bandOf = (h: number) => BAND_MAX.findIndex(max => h < max);

type Hltb = { name: string; match: string | null; main?: number | null; main_extra?: number | null; completionist?: number | null };
type Lengths = { main: number | null; main_extra: number | null; completionist: number | null; count: number | null };
type Parent = { by: "version_parent" | "parent_game" | "bundle"; ids: number[]; names: string[]; lengths: Lengths | null };
type SteamSpy = { median_h: number | null; average_h: number | null; owners: string | null };
type Result = {
  appid: number;
  name: string;
  igdbId: number | null;
  matchedBy: "steam" | "name" | null;
  igdb: Lengths | null;
  parent: Parent | null;
  steamspy: SteamSpy | null;
  hltb: Lengths | null;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const hours = (s: unknown) => (typeof s === "number" && s > 0 ? Math.round((s / 3600) * 100) / 100 : null);
const normalize = (s: string) =>
  s.replace(/[™®©]/g, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\(\d{4}\)/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function readCsv(file: string): { game: string; steam_appid: string }[] {
  const [head, ...lines] = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const cols = parseCsvLine(head);
  return lines.map(l => Object.fromEntries(parseCsvLine(l).map((v, i) => [cols[i], v])) as any);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function token(clientId: string, secret: string): Promise<string> {
  const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Twitch token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function igdbClient(clientId: string, accessToken: string) {
  return async function query(endpoint: string, body: string): Promise<any[]> {
    for (let attempt = 0; ; attempt++) {
      await sleep(PAUSE_MS);
      const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
        method: "POST",
        headers: { "Client-ID": clientId, Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        body,
      });
      if (res.status === 429 && attempt < 5) { await sleep(1000 * 2 ** attempt); continue; }
      if (!res.ok) throw new Error(`IGDB ${endpoint} failed: ${res.status} ${await res.text()}\nQuery: ${body}`);
      return res.json();
    }
  };
}
type Query = ReturnType<typeof igdbClient>;

const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function timesToBeat(query: Query, ids: number[]): Promise<Map<number, Lengths>> {
  const ttb = new Map<number, Lengths>();
  for (const batch of chunks([...new Set(ids)], BATCH)) {
    const found = await query("game_time_to_beats",
      `fields game_id,hastily,normally,completely,count; where game_id = (${batch.join(",")}); limit ${BATCH};`);
    for (const t of found) {
      ttb.set(t.game_id, { main: hours(t.hastily), main_extra: hours(t.normally), completionist: hours(t.completely), count: t.count ?? null });
    }
  }
  return ttb;
}

async function gamesById(query: Query, ids: number[], fields: string): Promise<any[]> {
  const out: any[] = [];
  for (const batch of chunks([...new Set(ids)], BATCH)) {
    out.push(...await query("games", `fields ${fields}; where id = (${batch.join(",")}); limit ${BATCH};`));
  }
  return out;
}

/** For IGDB games without a Main + Extras time, try the original game or, for bundles, the sum of the bundled games. */
async function parentLengths(query: Query, ids: number[]): Promise<Map<number, Parent>> {
  const out = new Map<number, Parent>();
  if (!ids.length) return out;

  // Editions and remasters point to the original
  const games = await gamesById(query, ids, "id,name,version_parent,parent_game");
  const parentOf = new Map<number, { id: number; by: "version_parent" | "parent_game" }>();
  for (const g of games) {
    if (g.version_parent) parentOf.set(g.id, { id: g.version_parent, by: "version_parent" });
    else if (g.parent_game) parentOf.set(g.id, { id: g.parent_game, by: "parent_game" });
  }
  const parentIds = [...parentOf.values()].map(p => p.id);
  const parentTtb = await timesToBeat(query, parentIds);
  const parentNames = new Map((await gamesById(query, parentIds, "id,name")).map(g => [g.id, g.name]));
  for (const [id, p] of parentOf) {
    out.set(id, { by: p.by, ids: [p.id], names: [parentNames.get(p.id) ?? "?"], lengths: parentTtb.get(p.id) ?? null });
  }

  // Bundles: the bundled games list the bundle in their `bundles` field. Sum them when all have a time.
  const rest = ids.filter(id => !out.get(id)?.lengths?.main_extra);
  if (rest.length) {
    try {
      const members = new Map<number, { id: number; name: string }[]>();
      for (const batch of chunks(rest, 100)) {
        const found = await query("games", `fields id,name,bundles; where bundles = (${batch.join(",")}); limit ${BATCH};`);
        for (const m of found) for (const b of m.bundles ?? []) {
          if (batch.includes(b)) members.set(b, [...(members.get(b) ?? []), { id: m.id, name: m.name }]);
        }
      }
      const memberTtb = await timesToBeat(query, [...members.values()].flat().map(m => m.id));
      for (const [bundle, ms] of members) {
        const times = ms.map(m => memberTtb.get(m.id)?.main_extra);
        const sum = times.every(t => t != null) ? Math.round(times.reduce((a, b) => a! + b!, 0)! * 100) / 100 : null;
        const counts = ms.map(m => memberTtb.get(m.id)?.count ?? 0);
        out.set(bundle, {
          by: "bundle", ids: ms.map(m => m.id), names: ms.map(m => m.name),
          lengths: sum == null ? null : { main: null, main_extra: sum, completionist: null, count: Math.min(...counts) },
        });
      }
    } catch (e: any) {
      console.warn(`Bundle lookup skipped: ${e.message.split("\n")[0]}`);
    }
  }
  return out;
}

async function steamSpy(appids: number[]): Promise<Map<number, SteamSpy>> {
  const file = join(HERE, "steamspy_cache.json");
  const cache: Record<string, SteamSpy> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const todo = appids.filter(a => !(a in cache));
  if (todo.length) console.log(`SteamSpy: fetching ${todo.length} games (~${Math.ceil(todo.length / 60)} min)…`);
  for (const [i, appid] of todo.entries()) {
    await sleep(STEAMSPY_PAUSE_MS);
    try {
      const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      const h = (m: unknown) => (typeof m === "number" && m > 0 ? Math.round((m / 60) * 100) / 100 : null);
      cache[appid] = { median_h: h(d.median_forever), average_h: h(d.average_forever), owners: d.owners ?? null };
    } catch (e: any) {
      console.warn(`  SteamSpy ${appid} failed (${e.message}); will retry on the next run`);
      continue;
    }
    if (i % 25 === 24) writeFileSync(file, JSON.stringify(cache));
  }
  writeFileSync(file, JSON.stringify(cache));
  return new Map(appids.filter(a => a in cache).map(a => [a, cache[a]]));
}

async function main() {
  const { TWITCH_CLIENT_ID: clientId, TWITCH_CLIENT_SECRET: secret } = process.env;
  if (!clientId || !secret) {
    console.error("Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (see https://dev.twitch.tv/console/apps).");
    process.exit(1);
  }

  const rows = readCsv(join(HERE, "hltb_20_-_Not_started.csv"));
  const hltbAll: Record<string, Hltb> = JSON.parse(readFileSync(join(HERE, "hltb_results.json"), "utf8"));
  const query = igdbClient(clientId, await token(clientId, secret));

  const games = rows.map(r => ({ appid: Number(r.steam_appid), name: r.game }));
  const igdbIdOf = new Map<number, { id: number; by: "steam" | "name" }>();

  // 1. Steam app ID -> IGDB game
  for (const batch of chunks(games, BATCH)) {
    const uids = batch.map(g => quote(String(g.appid))).join(",");
    const found = await query("external_games",
      `fields game,uid; where external_game_source = ${STEAM_SOURCE} & uid = (${uids}); limit ${BATCH};`);
    for (const e of found) if (e.game) igdbIdOf.set(Number(e.uid), { id: e.game, by: "steam" });
  }
  console.log(`Matched by Steam app ID: ${igdbIdOf.size}/${games.length}`);

  // 2. Exact (normalized) name search for the rest. Delisted apps have no usable name.
  const unmatched = games.filter(g => !igdbIdOf.has(g.appid) && !g.name.startsWith("<unknown app"));
  let byName = 0;
  for (const g of unmatched) {
    const found = await query("games", `search ${quote(g.name.replace(/[™®©]/g, ""))}; fields id,name; limit 10;`);
    const hit = found.find(x => normalize(x.name) === normalize(g.name));
    if (hit) { igdbIdOf.set(g.appid, { id: hit.id, by: "name" }); byName++; }
  }
  console.log(`Matched by exact name: ${byName}/${unmatched.length} remaining`);

  // 3. Time to beat for the matched IGDB games, then their parents for the ones without
  const ttb = await timesToBeat(query, [...igdbIdOf.values()].map(v => v.id));
  const missing = [...igdbIdOf.values()].map(v => v.id).filter(id => ttb.get(id)?.main_extra == null);
  const parents = await parentLengths(query, missing);
  console.log(`Parent or bundle lookups: ${parents.size} of ${missing.length} games without a time have one`);

  // 4. SteamSpy median playtime
  const spy = await steamSpy(games.map(g => g.appid));

  const results: Result[] = games.map(g => {
    const m = igdbIdOf.get(g.appid);
    const h = hltbAll[String(g.appid)];
    const hltbOk = h && h.match && !(WRONG[g.name] ?? []).includes(h.match);
    return {
      appid: g.appid,
      name: g.name,
      igdbId: m?.id ?? null,
      matchedBy: m?.by ?? null,
      igdb: m ? ttb.get(m.id) ?? null : null,
      parent: m ? parents.get(m.id) ?? null : null,
      steamspy: spy.get(g.appid) ?? null,
      hltb: hltbOk ? { main: h.main ?? null, main_extra: h.main_extra ?? null, completionist: h.completionist ?? null, count: null } : null,
    };
  });
  writeFileSync(join(HERE, "igdb_results.json"), JSON.stringify(results, null, 1));
  report(results);
}

// Candidate Main + Extras sources, in the order the app would use them
const SOURCES: { label: string; get: (r: Result) => number | null | undefined }[] = [
  { label: "IGDB", get: r => r.igdb?.main_extra },
  { label: "IGDB, 3+ submissions", get: r => ((r.igdb?.count ?? 0) >= LOW_COUNT ? r.igdb?.main_extra : null) },
  { label: "IGDB parent/bundle", get: r => r.parent?.lengths?.main_extra },
  { label: "SteamSpy median", get: r => r.steamspy?.median_h },
];
const igdbOrParent = (r: Result) => r.igdb?.main_extra ?? r.parent?.lengths?.main_extra;
const COMBINED: typeof SOURCES = [
  { label: "IGDB + parent/bundle", get: igdbOrParent },
  { label: "IGDB + parent + SteamSpy", get: r => igdbOrParent(r) ?? r.steamspy?.median_h },
];

function report(results: Result[]) {
  const n = results.length;
  const pct = (k: number, of = n) => `${k}/${of}`.padEnd(8) + ` (${of ? Math.round((k / of) * 100) : 0}%)`;
  const hltbOf = (r: Result) => r.hltb?.main_extra;

  console.log(`\n== Coverage and accuracy vs HLTB Main + Extras (${n} games; HLTB has ${results.filter(r => hltbOf(r) != null).length}) ==`);
  console.log(`${"Source".padEnd(26)}${"Has a time".padEnd(18)}${"Median diff".padEnd(13)}${"Within 25%".padEnd(13)}${"Same band".padEnd(11)}Bias`);
  const row = (s: (typeof SOURCES)[number]) => {
    const has = results.filter(r => s.get(r) != null);
    const both = has.filter(r => hltbOf(r) != null);
    const diffs = both.map(r => s.get(r)! / hltbOf(r)! - 1);
    const abs = diffs.map(Math.abs).sort((a, b) => a - b);
    const p = (k: number) => (both.length ? `${Math.round((k / both.length) * 100)}%` : "–");
    console.log(s.label.padEnd(26) + pct(has.length).padEnd(18) +
      (both.length ? `${Math.round(abs[Math.floor(abs.length / 2)] * 100)}%` : "–").padEnd(13) +
      p(abs.filter(d => d <= 0.25).length).padEnd(13) +
      p(both.filter(r => bandOf(s.get(r)!) === bandOf(hltbOf(r)!)).length).padEnd(11) +
      (both.length ? `${diffs.reduce((a, b) => a + b, 0) / diffs.length >= 0 ? "+" : ""}${Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 100)}%` : "–") +
      `   (n=${both.length})`);
  };
  SOURCES.forEach(row);
  console.log("");
  COMBINED.forEach(row);
  console.log("Accuracy columns only count games that also have an HLTB time. Bias = mean of (source / HLTB - 1).");

  const parentHits = results.filter(r => r.igdb?.main_extra == null && r.parent?.lengths?.main_extra != null);
  if (parentHits.length) {
    console.log(`\nFilled by parent or bundle (${parentHits.length}; h, parent vs HLTB):`);
    for (const r of parentHits) {
      console.log(`  ${String(r.parent!.lengths!.main_extra).padStart(6)} vs ${String(hltbOf(r) ?? "–").padEnd(6)} ${r.name}  ← ${r.parent!.by}: ${r.parent!.names.join(" + ")}`);
    }
  }

  const worst = (get: (r: Result) => number | null | undefined) => results
    .filter(r => get(r) != null && hltbOf(r) != null)
    .sort((a, b) => Math.abs(get(b)! / hltbOf(b)! - 1) - Math.abs(get(a)! / hltbOf(a)! - 1)).slice(0, 8);
  console.log(`\nLargest SteamSpy differences (h, SteamSpy median vs HLTB):`);
  for (const r of worst(r => r.steamspy?.median_h)) console.log(`  ${String(r.steamspy!.median_h).padStart(6)} vs ${hltbOf(r)}  ${r.name}`);

  const stillMissing = results.filter(r => igdbOrParent(r) == null && hltbOf(r) != null);
  console.log(`\nHLTB time but nothing on IGDB, even via parent (${stillMissing.length}); SteamSpy median shown when known:`);
  for (const r of stillMissing) console.log(`  ${String(r.steamspy?.median_h ?? "–").padStart(6)} vs ${String(hltbOf(r)).padEnd(6)} ${r.name}`);
  console.log(`\nFull results: tools/igdb_results.json`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
