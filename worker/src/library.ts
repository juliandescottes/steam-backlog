import { decodeEntities } from "@backlog/shared/names";
import { HttpError } from "./http.ts";

type Owned = { appid: number; name?: string; playtime_forever?: number; rtime_last_played?: number };

/** What local development imports without a Steam API key. */
const DEV_LIBRARY: Owned[] = [
  { appid: 400, name: "Portal", playtime_forever: 190, rtime_last_played: 1_400_000_000 },
  { appid: 620, name: "Portal 2", playtime_forever: 0 },
  { appid: 220, name: "Half-Life 2", playtime_forever: 600, rtime_last_played: 1_500_000_000 },
  { appid: 105600, name: "Terraria", playtime_forever: 45 },
  { appid: 413150, name: "Stardew Valley", playtime_forever: 0 },
];

/** SteamIDs below real accounts' range (7656119 + 8 digits starting at 7960265728); dev sign-in uses them. */
const isFakeSteamId = (id: string) => id < "76561197960265728";

/** IPlayerService/GetOwnedGames. An empty response means the profile's game details are private. */
async function ownedGames(env: Env, steamId: string): Promise<Owned[]> {
  if (env.DEV_LOGIN === "true" && (!env.STEAM_API_KEY || isFakeSteamId(steamId))) return DEV_LIBRARY;
  if (!env.STEAM_API_KEY) throw new HttpError(503, "steam_unavailable");
  const res = await fetch("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?" + new URLSearchParams({
    key: env.STEAM_API_KEY, steamid: steamId, include_appinfo: "1", include_played_free_games: "1", format: "json",
  }));
  if (!res.ok) throw new HttpError(502, "steam_error");
  const games = ((await res.json()) as { response?: { games?: Owned[] } }).response?.games;
  if (!games) throw new HttpError(409, "profile_private");
  return games;
}

/**
 * Imports the Steam library: catalog names, playtimes, and new games as Backlog (TECH.md §7).
 * Rows go in as one JSON parameter through json_each: D1 allows 100 bound parameters per query
 * and 50 queries per request on the free plan, and a library has thousands of games.
 * Each changed row gets its own rev; unchanged rows keep theirs (gaps in revs are fine).
 */
export async function refreshLibrary(env: Env, userId: string, steamId: string, now = Date.now()) {
  const owned = await ownedGames(env, steamId);
  const rows = JSON.stringify(owned.map(g => ({
    appid: g.appid,
    name: g.name ? decodeEntities(g.name) : null,
    playtime: g.playtime_forever ?? 0,
    lastPlayed: g.rtime_last_played ? g.rtime_last_played * 1000 : null,
  })));
  const count = () => env.DB.prepare("SELECT count(*) AS n FROM user_games WHERE user_id = ?").bind(userId).first<number>("n");
  const before = (await count()) ?? 0;

  await env.DB.batch([
    // Delisted apps have no name; keep a name we already know
    env.DB.prepare(
      `INSERT INTO games (appid, name, updated_at)
       SELECT j.value ->> 'appid', coalesce(j.value ->> 'name', 'Steam app ' || (j.value ->> 'appid')), ?1 FROM json_each(?2) j WHERE true
       ON CONFLICT (appid) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
       WHERE excluded.name NOT LIKE 'Steam app %' AND games.name IS NOT excluded.name`,
    ).bind(now, rows),
    env.DB.prepare("UPDATE user_rev SET rev = rev + ?2 WHERE user_id = ?1").bind(userId, owned.length),
    // "Date added": Steam has no purchase date, so a game played before the import counts from then
    env.DB.prepare(
      `INSERT INTO user_games (user_id, appid, playtime_min, last_played_at, first_seen_at, rev)
       SELECT ?1, j.value ->> 'appid', j.value ->> 'playtime', j.value ->> 'lastPlayed',
         min(?3, coalesce(j.value ->> 'lastPlayed', ?3)),
         (SELECT rev FROM user_rev WHERE user_id = ?1) - ?4 + j.key + 1
       FROM json_each(?2) j WHERE true
       ON CONFLICT (user_id, appid) DO UPDATE SET playtime_min = excluded.playtime_min, last_played_at = excluded.last_played_at, rev = excluded.rev
       WHERE user_games.playtime_min IS NOT excluded.playtime_min OR user_games.last_played_at IS NOT excluded.last_played_at`,
    ).bind(userId, rows, now, owned.length),
    env.DB.prepare("UPDATE users SET library_synced_at = ? WHERE id = ?").bind(now, userId),
  ]);

  const total = (await count()) ?? 0;
  return { added: total - before, total };
}
