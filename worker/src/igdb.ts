import { roundHours } from "@backlog/shared/bands";
import { normalizeName } from "@backlog/shared/names";

/**
 * IGDB enrichment (TECH.md §8): Steam appid → IGDB game → time to beat, with the version_parent's
 * time for editions and remasters. A cron run checks one batch; the Workers free plan allows 50
 * outbound requests per run, so a batch is 100 games with at most 40 name searches.
 */
const STEAM_SOURCE = 1; // IGDB external game source id for Steam
const BATCH = 100;
const NAME_SEARCHES = 40;
const PAUSE_MS = 260; // IGDB allows 4 requests per second
const DAY = 24 * 60 * 60 * 1000;

type Ttb = { main: number | null; main_extra: number | null; comp: number | null; count: number | null };
type Query = (endpoint: string, body: string) => Promise<any[]>;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const hours = (s: unknown) => (typeof s === "number" && s > 0 ? roundHours(s / 3600) : null);
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const sameName = (a: string, b: string) => normalizeName(a.replace(/\(\d{4}\)/g, "")) === normalizeName(b.replace(/\(\d{4}\)/g, ""));

async function token(env: Env, now: number): Promise<string> {
  const cached = await env.DB.prepare("SELECT value FROM cache WHERE key = 'twitch_token' AND expires_at > ?").bind(now).first<string>("value");
  if (cached) return cached;
  const res = await fetch("https://id.twitch.tv/oauth2/token?" + new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID!, client_secret: env.TWITCH_CLIENT_SECRET!, grant_type: "client_credentials",
  }), { method: "POST" });
  if (!res.ok) throw new Error(`Twitch token: ${res.status}`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  // Tokens last about two months; renew a day early
  await env.DB.prepare("INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES ('twitch_token', ?, ?)")
    .bind(t.access_token, now + t.expires_in * 1000 - DAY).run();
  return t.access_token;
}

function client(env: Env, accessToken: string, pauseMs: number): Query {
  let first = true;
  return async (endpoint, body) => {
    if (!first) await sleep(pauseMs);
    first = false;
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      body,
    });
    if (res.status === 401) await env.DB.prepare("DELETE FROM cache WHERE key = 'twitch_token'").run();
    if (!res.ok) throw new Error(`IGDB ${endpoint}: ${res.status}`);
    return res.json();
  };
}

async function timesToBeat(query: Query, ids: number[]): Promise<Map<number, Ttb>> {
  const out = new Map<number, Ttb>();
  if (!ids.length) return out;
  const found = await query("game_time_to_beats", `fields game_id,hastily,normally,completely,count; where game_id = (${[...new Set(ids)].join(",")}); limit 500;`);
  for (const t of found) out.set(t.game_id, { main: hours(t.hastily), main_extra: hours(t.normally), comp: hours(t.completely), count: t.count ?? null });
  return out;
}

/** Games due a check: never checked, unknown for a week, or known for a month. */
function queue(env: Env, now: number) {
  return env.DB.prepare(
    `SELECT appid, name FROM games
     WHERE igdb_checked_at IS NULL
        OR (igdb_main IS NULL AND igdb_main_extra IS NULL AND igdb_comp IS NULL AND igdb_checked_at < ?2)
        OR igdb_checked_at < ?3
     ORDER BY igdb_checked_at IS NOT NULL, igdb_checked_at LIMIT ?1`,
  ).bind(BATCH, now - 7 * DAY, now - 30 * DAY).all<{ appid: number; name: string }>();
}

export async function enrich(env: Env, now = Date.now(), pauseMs = PAUSE_MS): Promise<{ checked: number; found: number }> {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { checked: 0, found: 0 };
  const games = (await queue(env, now)).results;
  if (!games.length) return { checked: 0, found: 0 };
  const query = client(env, await token(env, now), pauseMs);

  // 1. Steam appid → IGDB game
  const igdbId = new Map<number, number>();
  const ext = await query("external_games",
    `fields game,uid; where external_game_source = ${STEAM_SOURCE} & uid = (${games.map(g => quote(String(g.appid))).join(",")}); limit 500;`);
  for (const e of ext) if (e.game) igdbId.set(Number(e.uid), e.game);

  // 2. Exact name for the rest; delisted apps have no usable name. Games past the cap wait for the next run.
  const searchable = games.filter(g => !igdbId.has(g.appid) && !g.name.startsWith("Steam app "));
  const searched = searchable.slice(0, NAME_SEARCHES);
  for (const g of searched) {
    const found = await query("games", `search ${quote(g.name.replace(/[™®©]/g, ""))}; fields id,name; limit 10;`);
    const hit = found.find(x => sameName(x.name, g.name));
    if (hit) igdbId.set(g.appid, hit.id);
  }
  const deferred = new Set(searchable.slice(NAME_SEARCHES).map(g => g.appid));

  // 3. Time to beat, then the version_parent's for games without one
  const ttb = await timesToBeat(query, [...igdbId.values()]);
  const without = [...igdbId.values()].filter(id => !ttb.has(id));
  if (without.length) {
    const versions = await query("games", `fields id,version_parent; where id = (${without.join(",")}) & version_parent != null; limit 500;`);
    const parentTtb = await timesToBeat(query, versions.map(v => v.version_parent));
    for (const v of versions) {
      const t = parentTtb.get(v.version_parent);
      if (t) ttb.set(v.id, t);
    }
  }

  // 4. One statement for the batch; updated_at tells clients to pick up the change on their next sync
  const rows = games.filter(g => !deferred.has(g.appid)).map(g => {
    const id = igdbId.get(g.appid) ?? null;
    return { appid: g.appid, id, ...(id != null ? ttb.get(id) : null) };
  });
  await env.DB.prepare(
    `UPDATE games SET igdb_id = j.value ->> 'id',
       igdb_main = j.value ->> 'main', igdb_main_extra = j.value ->> 'main_extra', igdb_comp = j.value ->> 'comp', igdb_count = j.value ->> 'count',
       igdb_checked_at = ?2,
       updated_at = CASE WHEN igdb_main IS NOT j.value ->> 'main' OR igdb_main_extra IS NOT j.value ->> 'main_extra'
         OR igdb_comp IS NOT j.value ->> 'comp' OR igdb_count IS NOT j.value ->> 'count' THEN ?2 ELSE updated_at END
     FROM json_each(?1) j WHERE games.appid = j.value ->> 'appid'`,
  ).bind(JSON.stringify(rows), now).run();
  return { checked: rows.length, found: rows.filter(r => r.main_extra != null || r.main != null || r.comp != null).length };
}
