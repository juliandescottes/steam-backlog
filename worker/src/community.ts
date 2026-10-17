import { roundHours } from "@backlog/shared/bands";

/**
 * Community lengths (TECH.md §8). Each user's rows mirror their games: exact lengths they typed,
 * the Steam playtime of games they finished (over 30 min), and No ending. Rough guesses and
 * imported lengths are never shared, nor anything from users who turned sharing off.
 */

const IN_APPIDS = "appid IN (SELECT value FROM json_each(?2))";

/** Rewrites the user's rows for these games from their current state. Run in the batch that changes them. */
export function writeRows(env: Env, userId: string, appids: number[], now: number): D1PreparedStatement[] {
  const list = JSON.stringify(appids);
  return [
    env.DB.prepare(`DELETE FROM community_lengths WHERE user_id = ?1 AND ${IN_APPIDS}`).bind(userId, list),
    env.DB.prepare(
      `INSERT INTO community_lengths (user_id, appid, kind, main, main_extra, comp, created_at)
       SELECT * FROM (
         SELECT user_id, appid, 'typed', my_main, my_main_extra, my_comp, ?3 FROM user_games
         WHERE user_id = ?1 AND ${IN_APPIDS} AND my_len_kind = 'exact'
           AND (my_main IS NOT NULL OR my_main_extra IS NOT NULL OR my_comp IS NOT NULL)
         UNION ALL
         SELECT user_id, appid, 'endless', NULL, NULL, NULL, ?3 FROM user_games
         WHERE user_id = ?1 AND ${IN_APPIDS} AND my_len_kind = 'endless'
         UNION ALL
         SELECT user_id, appid, 'finished_playtime', NULL, max(0.25, round(playtime_min / 15.0) * 0.25), NULL, ?3 FROM user_games
         WHERE user_id = ?1 AND ${IN_APPIDS} AND status = 'finished' AND playtime_min > 30
       ) WHERE (SELECT coalesce(settings_json ->> '$.shareLengths', 1) FROM users WHERE id = ?1)`,
    ).bind(userId, list, now),
  ];
}

/** A median already ignores a few idle-time outliers (dropping 10% from each end wouldn't change it). */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return roundHours(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Recomputes the games' community length. Each user counts once: their typed Main + Extras, else
 * their finished playtime; users who said No ending count toward that instead.
 */
export async function recompute(env: Env, appids: number[], now: number) {
  if (!appids.length) return;
  const rows = (await env.DB.prepare(
    `SELECT appid, user_id, kind, main_extra FROM community_lengths WHERE appid IN (SELECT value FROM json_each(?1))`,
  ).bind(JSON.stringify(appids)).all<{ appid: number; user_id: string; kind: string; main_extra: number | null }>()).results;

  const byGame = new Map<number, Map<string, { typed?: number; played?: number; endless?: boolean }>>();
  for (const r of rows) {
    const users = byGame.get(r.appid) ?? byGame.set(r.appid, new Map()).get(r.appid)!;
    const u = users.get(r.user_id) ?? users.set(r.user_id, {}).get(r.user_id)!;
    if (r.kind === "endless") u.endless = true;
    else if (r.main_extra != null) u[r.kind === "typed" ? "typed" : "played"] = r.main_extra;
  }
  const out = appids.map(appid => {
    const users = [...(byGame.get(appid)?.values() ?? [])];
    const values = users.filter(u => !u.endless).map(u => u.typed ?? u.played).filter((v): v is number => v != null);
    return { appid, main_extra: median(values), count: values.length, endless: users.filter(u => u.endless).length };
  });
  await env.DB.prepare(
    `UPDATE games SET comm_main_extra = j.value ->> 'main_extra', comm_count = j.value ->> 'count', comm_endless_count = j.value ->> 'endless',
       updated_at = CASE WHEN comm_main_extra IS NOT j.value ->> 'main_extra' OR comm_count IS NOT j.value ->> 'count'
         OR comm_endless_count IS NOT j.value ->> 'endless' THEN ?2 ELSE updated_at END
     FROM json_each(?1) j WHERE games.appid = j.value ->> 'appid'`,
  ).bind(JSON.stringify(out), now).run();
}

/** Turning sharing off deletes the user's rows; turning it on writes them from their games. */
export async function setSharing(env: Env, userId: string, share: boolean, now = Date.now()) {
  const appids = (await env.DB.prepare("SELECT appid FROM user_games WHERE user_id = ?").bind(userId).all<{ appid: number }>())
    .results.map(r => r.appid);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET settings_json = json_set(settings_json, '$.shareLengths', json(?2)) WHERE id = ?1")
      .bind(userId, JSON.stringify(share)),
    ...writeRows(env, userId, appids, now),
  ]);
  await recompute(env, appids, now);
}

/** Deletes an account and everything tied to it; games it gave a community length get theirs recomputed. */
export async function deleteAccount(env: Env, userId: string, now = Date.now()) {
  const appids = (await env.DB.prepare("SELECT DISTINCT appid FROM community_lengths WHERE user_id = ?").bind(userId).all<{ appid: number }>())
    .results.map(r => r.appid);
  // Foreign keys cascade, but deleting each table explicitly doesn't depend on them being enforced
  await env.DB.batch([
    ...["list_items", "lists", "views", "community_lengths", "user_games", "applied_ops", "sessions", "user_rev"].map(t =>
      env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId)),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
  await recompute(env, appids, now);
}
