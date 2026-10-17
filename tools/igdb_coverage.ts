/*
 * IGDB coverage check (milestone 0 in TECH.md).
 * For every game in the collection CSV, look up IGDB's time-to-beat data via the Steam app ID
 * (falling back to an exact name search) and compare it with the HLTB times in hltb_results.json.
 *
 * Usage: TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... node tools/igdb_coverage.ts
 * Needs Node 23.6+ (runs TypeScript directly). Writes igdb_results.json next to this script.
 * Credentials: register an application at https://dev.twitch.tv/console/apps.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STEAM_SOURCE = 1; // IGDB external game source id for Steam
const BATCH = 500; // IGDB's max results per query
const PAUSE_MS = 300; // IGDB allows 4 requests per second

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
type Result = {
  appid: number;
  name: string;
  igdbId: number | null;
  matchedBy: "steam" | "name" | null;
  igdb: Lengths | null;
  hltb: Lengths | null;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const hours = (s: unknown) => (typeof s === "number" && s > 0 ? Math.round((s / 3600) * 100) / 100 : null);
const normalize = (s: string) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[™®©]/g, "").replace(/\(\d{4}\)/g, "")
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

const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

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

  // 3. Time to beat for the matched IGDB games
  const ttb = new Map<number, Lengths>();
  for (const batch of chunks([...new Set([...igdbIdOf.values()].map(v => v.id))], BATCH)) {
    const found = await query("game_time_to_beats",
      `fields game_id,hastily,normally,completely,count; where game_id = (${batch.join(",")}); limit ${BATCH};`);
    for (const t of found) {
      ttb.set(t.game_id, { main: hours(t.hastily), main_extra: hours(t.normally), completionist: hours(t.completely), count: t.count ?? null });
    }
  }

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
      hltb: hltbOk ? { main: h.main ?? null, main_extra: h.main_extra ?? null, completionist: h.completionist ?? null, count: null } : null,
    };
  });
  writeFileSync(join(HERE, "igdb_results.json"), JSON.stringify(results, null, 1));
  report(results);
}

function report(results: Result[]) {
  const n = results.length;
  const pct = (k: number, of = n) => `${k}/${of} (${of ? Math.round((k / of) * 100) : 0}%)`;
  const has = (l: Lengths | null, k: keyof Lengths) => l?.[k] != null;

  const igdbAny = results.filter(r => has(r.igdb, "main") || has(r.igdb, "main_extra") || has(r.igdb, "completionist"));
  const igdbMe = results.filter(r => has(r.igdb, "main_extra"));
  const hltbMe = results.filter(r => has(r.hltb, "main_extra"));
  const both = results.filter(r => has(r.igdb, "main_extra") && has(r.hltb, "main_extra"));
  const onlyIgdb = results.filter(r => has(r.igdb, "main_extra") && !has(r.hltb, "main_extra"));
  const onlyHltb = results.filter(r => !has(r.igdb, "main_extra") && has(r.hltb, "main_extra"));

  console.log(`\n== Coverage (${n} games) ==`);
  console.log(`Found on IGDB:              ${pct(results.filter(r => r.igdbId).length)}`);
  console.log(`IGDB has any time:          ${pct(igdbAny.length)}`);
  console.log(`IGDB Main + Extras:         ${pct(igdbMe.length)}`);
  console.log(`HLTB Main + Extras:         ${pct(hltbMe.length)}`);
  console.log(`Both:                       ${both.length}   only IGDB: ${onlyIgdb.length}   only HLTB: ${onlyHltb.length}`);

  if (both.length) {
    const diffs = both.map(r => r.igdb!.main_extra! / r.hltb!.main_extra! - 1);
    const abs = diffs.map(Math.abs).sort((a, b) => a - b);
    const median = abs[Math.floor(abs.length / 2)];
    const sameBand = both.filter(r => bandOf(r.igdb!.main_extra!) === bandOf(r.hltb!.main_extra!)).length;
    const bias = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    console.log(`\n== Main + Extras, IGDB vs HLTB (${both.length} games with both) ==`);
    console.log(`Median absolute difference: ${Math.round(median * 100)}%`);
    console.log(`Within 25%:                 ${pct(abs.filter(d => d <= 0.25).length, both.length)}`);
    console.log(`Same length band:           ${pct(sameBand, both.length)}`);
    console.log(`Mean bias (IGDB vs HLTB):   ${bias >= 0 ? "+" : ""}${Math.round(bias * 100)}%`);

    const worst = [...both].sort((a, b) =>
      Math.abs(b.igdb!.main_extra! / b.hltb!.main_extra! - 1) - Math.abs(a.igdb!.main_extra! / a.hltb!.main_extra! - 1)).slice(0, 10);
    console.log(`\nLargest differences (h, IGDB vs HLTB, IGDB submissions):`);
    for (const r of worst) console.log(`  ${r.igdb!.main_extra} vs ${r.hltb!.main_extra}  (${r.igdb!.count ?? "?"})  ${r.name}`);
  }

  if (onlyHltb.length) {
    console.log(`\nHLTB time but none on IGDB (${onlyHltb.length}):`);
    for (const r of onlyHltb) console.log(`  ${r.igdbId ? "no time  " : "not found"}  ${r.name}`);
  }
  console.log(`\nFull results: tools/igdb_results.json`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
