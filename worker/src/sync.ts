import { mergeOps, validOp, type GameFields, type SyncRequest, type SyncResponse } from "@backlog/shared/sync";
import type { Game, LenKind, Status } from "@backlog/shared/types";
import { recompute, writeRows } from "./community.ts";
import { HttpError } from "./http.ts";

const DAY = 24 * 60 * 60 * 1000;
const MAX_OPS = 5000;

type Row = {
  appid: number; name: string; has_portrait_art: number | null;
  igdb_main: number | null; igdb_main_extra: number | null; igdb_comp: number | null; igdb_count: number | null;
  comm_main_extra: number | null; comm_count: number; comm_endless_count: number;
  status: Status; status_at: number | null; finished_at: number | null; note: string;
  my_main: number | null; my_main_extra: number | null; my_comp: number | null; my_len_kind: LenKind | null;
  playtime_min: number; last_played_at: number | null; first_seen_at: number;
};

const toGame = (r: Row): Game => ({
  appid: r.appid, name: r.name,
  portrait: r.has_portrait_art == null ? null : r.has_portrait_art === 1,
  playtimeMin: r.playtime_min, lastPlayedAt: r.last_played_at, addedAt: r.first_seen_at,
  igdb: r.igdb_main == null && r.igdb_main_extra == null && r.igdb_comp == null ? null
    : { main: r.igdb_main, main_extra: r.igdb_main_extra, comp: r.igdb_comp, count: r.igdb_count },
  community: r.comm_count || r.comm_endless_count
    ? { main_extra: r.comm_main_extra, count: r.comm_count, endlessCount: r.comm_endless_count } : null,
  status: r.status, statusAt: r.status_at, finishedAt: r.finished_at, note: r.note,
  my: r.my_main == null && r.my_main_extra == null && r.my_comp == null ? null
    : { main: r.my_main, main_extra: r.my_main_extra, comp: r.my_comp },
  myKind: r.my_len_kind,
});

/** Columns an op can set, and where each value sits in the flattened op. */
const SETTABLE: [column: string, path: string][] = [
  ["status", "status"], ["status_at", "statusAt"], ["finished_at", "finishedAt"], ["note", "note"],
  ["my_main", "myMain"], ["my_main_extra", "myMainExtra"], ["my_comp", "myComp"], ["my_len_kind", "myKind"],
];

function flatten(appid: number, s: Partial<GameFields>) {
  const { my, ...rest } = s;
  return { appid, ...rest, ...("my" in s ? { myMain: my?.main ?? null, myMainExtra: my?.main_extra ?? null, myComp: my?.comp ?? null } : {}) };
}

/**
 * Applies ops (skipping ones already applied), then returns every game of the user changed since the
 * client's cursors. Last writer wins per field, in the order the server receives ops.
 */
export async function sync(env: Env, userId: string, req: SyncRequest, now = Date.now()): Promise<SyncResponse> {
  const since = Number(req.since) || 0, catalogSince = Number(req.catalogSince) || 0;
  const ops = Array.isArray(req.ops) ? req.ops.filter(validOp) : [];
  if (ops.length > MAX_OPS) throw new HttpError(413, "too_many_ops");

  if (ops.length) {
    const seen = new Set((await env.DB.prepare(
      "SELECT op_id FROM applied_ops WHERE user_id = ? AND op_id IN (SELECT value FROM json_each(?))",
    ).bind(userId, JSON.stringify(ops.map(o => o.id))).all<{ op_id: string }>()).results.map(r => r.op_id));
    const fresh = ops.filter(o => !seen.has(o.id));
    const patches = [...mergeOps(fresh)].map(([appid, set]) => flatten(appid, set));
    // A field missing from the op keeps its value; JSON null sets NULL
    const sets = SETTABLE.map(([col, path]) =>
      `${col} = CASE WHEN json_type(j.value, '$.${path}') IS NULL THEN ${col} ELSE j.value ->> '${path}' END`).join(", ");
    if (patches.length) {
      await env.DB.batch([
        env.DB.prepare("UPDATE user_rev SET rev = rev + ?2 WHERE user_id = ?1").bind(userId, patches.length),
        env.DB.prepare(
          `UPDATE user_games SET ${sets}, rev = (SELECT rev FROM user_rev WHERE user_id = ?1) - ?3 + j.key + 1
           FROM json_each(?2) j WHERE user_games.user_id = ?1 AND user_games.appid = j.value ->> 'appid'`,
        ).bind(userId, JSON.stringify(patches), patches.length),
        env.DB.prepare("INSERT OR IGNORE INTO applied_ops (user_id, op_id, at) SELECT ?1, value, ?3 FROM json_each(?2)")
          .bind(userId, JSON.stringify(fresh.map(o => o.id)), now),
        env.DB.prepare("DELETE FROM applied_ops WHERE user_id = ? AND at < ?").bind(userId, now - DAY),
        ...writeRows(env, userId, patches.map(p => p.appid), now),
      ]);
      await recompute(env, patches.map(p => p.appid), now);
    }
  }

  const [rev, rows] = await env.DB.batch<any>([
    env.DB.prepare("SELECT rev FROM user_rev WHERE user_id = ?").bind(userId),
    env.DB.prepare(
      `SELECT g.appid, g.name, g.has_portrait_art, g.igdb_main, g.igdb_main_extra, g.igdb_comp, g.igdb_count,
         g.comm_main_extra, g.comm_count, g.comm_endless_count,
         ug.status, ug.status_at, ug.finished_at, ug.note, ug.my_main, ug.my_main_extra, ug.my_comp, ug.my_len_kind,
         ug.playtime_min, ug.last_played_at, ug.first_seen_at
       FROM user_games ug JOIN games g USING (appid)
       WHERE ug.user_id = ? AND (ug.rev > ? OR g.updated_at > ?)`,
    ).bind(userId, since, catalogSince),
  ]);
  // The catalog cursor trails by a minute: a row another request writes during this one is sent again, not missed
  return { rev: (rev.results[0] as { rev: number }).rev, catalogAt: now - 60_000, games: (rows.results as Row[]).map(toGame) };
}
