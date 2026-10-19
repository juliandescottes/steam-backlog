import {
  mergeItemOps, mergeListOps, mergeOps, mergeViewOps, validOp, type GameFields, type SyncItem, type SyncList, type SyncRequest, type SyncResponse, type SyncView,
} from "@backlog/shared/sync";
import type { Game, LenKind, Status } from "@backlog/shared/types";
import { communityOn, recompute, writeRows } from "./community.ts";
import { HttpError } from "./http.ts";

const DAY = 24 * 60 * 60 * 1000;
const MAX_OPS = 5000;

export type Row = {
  appid: number; name: string; has_portrait_art: number | null;
  igdb_main: number | null; igdb_main_extra: number | null; igdb_comp: number | null; igdb_count: number | null;
  comm_main_extra: number | null; comm_count: number; comm_endless_count: number;
  status: Status; status_at: number | null; finished_at: number | null; note: string;
  my_main: number | null; my_main_extra: number | null; my_comp: number | null; my_len_kind: LenKind | null; triage_declined: number;
  playtime_min: number; last_played_at: number | null; first_seen_at: number;
};

export const toGame = (r: Row, community: boolean): Game => ({
  appid: r.appid, name: r.name,
  portrait: r.has_portrait_art == null ? null : r.has_portrait_art === 1,
  playtimeMin: r.playtime_min, lastPlayedAt: r.last_played_at, addedAt: r.first_seen_at,
  igdb: r.igdb_main == null && r.igdb_main_extra == null && r.igdb_comp == null ? null
    : { main: r.igdb_main, main_extra: r.igdb_main_extra, comp: r.igdb_comp, count: r.igdb_count },
  community: community && (r.comm_count || r.comm_endless_count)
    ? { main_extra: r.comm_main_extra, count: r.comm_count, endlessCount: r.comm_endless_count } : null,
  status: r.status, statusAt: r.status_at, finishedAt: r.finished_at, note: r.note,
  my: r.my_main == null && r.my_main_extra == null && r.my_comp == null ? null
    : { main: r.my_main, main_extra: r.my_main_extra, comp: r.my_comp },
  myKind: r.my_len_kind, triageDeclined: r.triage_declined === 1,
});

/** A game as a client gets it: `games g` joined with `user_games ug`. */
export const GAME_COLUMNS = `g.appid, g.name, g.has_portrait_art, g.igdb_main, g.igdb_main_extra, g.igdb_comp, g.igdb_count,
  g.comm_main_extra, g.comm_count, g.comm_endless_count,
  ug.status, ug.status_at, ug.finished_at, ug.note, ug.my_main, ug.my_main_extra, ug.my_comp, ug.my_len_kind, ug.triage_declined,
  ug.playtime_min, ug.last_played_at, ug.first_seen_at`;

/** Columns an op can set, and where each value sits in the flattened op. */
const SETTABLE: [column: string, path: string][] = [
  ["status", "status"], ["status_at", "statusAt"], ["finished_at", "finishedAt"], ["note", "note"],
  ["my_main", "myMain"], ["my_main_extra", "myMainExtra"], ["my_comp", "myComp"], ["my_len_kind", "myKind"],
  ["triage_declined", "triageDeclined"],
];

/** View columns an op can set, and the op field holding each. */
const VIEW_SETTABLE: [column: string, path: string][] = [
  ["name", "name"], ["filter_json", "filter"], ["sort", "sort"], ["position", "position"], ["deleted", "deleted"],
];

type ViewRow = { id: string; name: string; filter_json: string; sort: SyncView["sort"]; position: string; deleted: number };
const toView = (r: ViewRow): SyncView => ({
  id: r.id, name: r.name, filter: JSON.parse(r.filter_json), sort: r.sort, position: r.position, deleted: r.deleted === 1,
});

const LIST_SETTABLE: [column: string, path: string][] = [
  ["title", "title"], ["description", "description"], ["kind", "kind"], ["filter_json", "filter"], ["sort", "sort"],
  ["visibility", "visibility"], ["position", "position"], ["deleted", "deleted"],
]; // share_id is set when a list is created and never changes, so no update can hit the unique index
const ITEM_SETTABLE: [column: string, path: string][] = [["position", "position"], ["deleted", "deleted"]];

type ListRow = {
  id: string; title: string; description: string; kind: SyncList["kind"]; filter_json: string | null; sort: SyncList["sort"];
  share_id: string; visibility: SyncList["visibility"]; position: string; deleted: number;
};
const toList = (r: ListRow): SyncList => ({
  id: r.id, title: r.title, description: r.description, kind: r.kind, filter: r.filter_json == null ? null : JSON.parse(r.filter_json),
  sort: r.sort, shareId: r.share_id, visibility: r.visibility, position: r.position, deleted: r.deleted === 1,
});
type ItemRow = { list_id: string; appid: number; position: string; deleted: number };
const toItem = (r: ItemRow): SyncItem => ({ listId: r.list_id, appid: r.appid, position: r.position, deleted: r.deleted === 1 });

function flatten(appid: number, s: Partial<GameFields>) {
  const { my, ...rest } = s;
  return { appid, ...rest, ...("my" in s ? { myMain: my?.main ?? null, myMainExtra: my?.main_extra ?? null, myComp: my?.comp ?? null } : {}) };
}

/**
 * Applies ops (skipping ones already applied), then returns every game and view of the user changed
 * since the client's cursors. Last writer wins per field, in the order the server receives ops.
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
    const viewPatches = [...mergeViewOps(fresh)].map(([id, set]) => ({ id, ...set }));
    const listPatches = [...mergeListOps(fresh)].map(([id, set]) => ({ id, ...set }));
    const itemPatches = mergeItemOps(fresh).map(({ listId, appid, set }) => ({ listId, appid, ...set }));
    // A field missing from the op keeps its value; JSON null sets NULL
    const keep = (cols: [string, string][]) => cols.map(([col, path]) =>
      `${col} = CASE WHEN json_type(j.value, '$.${path}') IS NULL THEN ${col} ELSE j.value ->> '${path}' END`).join(", ");
    // Every changed row gets the next rev: games, then views, lists and items
    const n = patches.length + viewPatches.length + listPatches.length + itemPatches.length;
    const [atViews, atLists, atItems] = [patches.length, patches.length + viewPatches.length, n - itemPatches.length];
    const nextRev = (offset: number) => `(SELECT rev FROM user_rev WHERE user_id = ?1) - ${n} + ${offset} + j.key + 1`;
    if (fresh.length) {
      await env.DB.batch([
        env.DB.prepare("UPDATE user_rev SET rev = rev + ?2 WHERE user_id = ?1").bind(userId, n),
        env.DB.prepare(
          `UPDATE user_games SET ${keep(SETTABLE)}, rev = ${nextRev(0)}
           FROM json_each(?2) j WHERE user_games.user_id = ?1 AND user_games.appid = j.value ->> 'appid'`,
        ).bind(userId, JSON.stringify(patches)),
        // Views: update the user's own, then create new ones (an id taken by another user is ignored)
        env.DB.prepare(
          `UPDATE views SET ${keep(VIEW_SETTABLE)}, rev = ${nextRev(atViews)}
           FROM json_each(?2) j WHERE views.user_id = ?1 AND views.id = j.value ->> 'id'`,
        ).bind(userId, JSON.stringify(viewPatches)),
        env.DB.prepare(
          `INSERT OR IGNORE INTO views (id, user_id, name, filter_json, sort, position, rev, deleted)
           SELECT j.value ->> 'id', ?1, coalesce(j.value ->> 'name', ''), coalesce(j.value ->> 'filter', '{}'),
             coalesce(j.value ->> 'sort', 'length'), coalesce(j.value ->> 'position', ''), ${nextRev(atViews)},
             coalesce(j.value ->> 'deleted', 0)
           FROM json_each(?2) j WHERE NOT EXISTS (SELECT 1 FROM views v WHERE v.id = j.value ->> 'id')`,
        ).bind(userId, JSON.stringify(viewPatches)),
        // Lists the same way; items only go into the user's own lists
        env.DB.prepare(
          `UPDATE lists SET ${keep(LIST_SETTABLE)}, rev = ${nextRev(atLists)}
           FROM json_each(?2) j WHERE lists.user_id = ?1 AND lists.id = j.value ->> 'id'`,
        ).bind(userId, JSON.stringify(listPatches)),
        env.DB.prepare(
          `INSERT OR IGNORE INTO lists (id, user_id, title, description, kind, filter_json, sort, share_id, visibility, position, rev, deleted)
           SELECT j.value ->> 'id', ?1, coalesce(j.value ->> 'title', 'List'), coalesce(j.value ->> 'description', ''),
             coalesce(j.value ->> 'kind', 'manual'), j.value ->> 'filter', j.value ->> 'sort', coalesce(j.value ->> 'shareId', lower(hex(randomblob(6)))),
             coalesce(j.value ->> 'visibility', 'private'), coalesce(j.value ->> 'position', 'i'), ${nextRev(atLists)},
             coalesce(j.value ->> 'deleted', 0)
           FROM json_each(?2) j WHERE NOT EXISTS (SELECT 1 FROM lists l WHERE l.id = j.value ->> 'id')`,
        ).bind(userId, JSON.stringify(listPatches)),
        env.DB.prepare(
          `UPDATE list_items SET ${keep(ITEM_SETTABLE)}, rev = ${nextRev(atItems)}
           FROM json_each(?2) j WHERE list_items.user_id = ?1 AND list_items.list_id = j.value ->> 'listId' AND list_items.appid = j.value ->> 'appid'`,
        ).bind(userId, JSON.stringify(itemPatches)),
        env.DB.prepare(
          `INSERT OR IGNORE INTO list_items (list_id, appid, user_id, position, rev, deleted)
           SELECT j.value ->> 'listId', j.value ->> 'appid', ?1, coalesce(j.value ->> 'position', 'i'), ${nextRev(atItems)},
             coalesce(j.value ->> 'deleted', 0)
           FROM json_each(?2) j WHERE EXISTS (SELECT 1 FROM lists l WHERE l.id = j.value ->> 'listId' AND l.user_id = ?1)`,
        ).bind(userId, JSON.stringify(itemPatches)),
        env.DB.prepare("INSERT OR IGNORE INTO applied_ops (user_id, op_id, at) SELECT ?1, value, ?3 FROM json_each(?2)")
          .bind(userId, JSON.stringify(fresh.map(o => o.id)), now),
        env.DB.prepare("DELETE FROM applied_ops WHERE user_id = ? AND at < ?").bind(userId, now - DAY),
        ...writeRows(env, userId, patches.map(p => p.appid), now),
      ]);
      if (patches.length && communityOn(env)) await recompute(env, patches.map(p => p.appid), now);
    }
  }

  const [rev, rows, viewRows, listRows, itemRows] = await env.DB.batch<any>([
    env.DB.prepare("SELECT rev FROM user_rev WHERE user_id = ?").bind(userId),
    env.DB.prepare(
      `SELECT ${GAME_COLUMNS}
       FROM user_games ug JOIN games g USING (appid)
       WHERE ug.user_id = ? AND (ug.rev > ? OR g.updated_at > ?)`,
    ).bind(userId, since, catalogSince),
    env.DB.prepare("SELECT id, name, filter_json, sort, position, deleted FROM views WHERE user_id = ? AND rev > ?").bind(userId, since),
    env.DB.prepare(
      "SELECT id, title, description, kind, filter_json, sort, share_id, visibility, position, deleted FROM lists WHERE user_id = ? AND rev > ?",
    ).bind(userId, since),
    env.DB.prepare("SELECT list_id, appid, position, deleted FROM list_items WHERE user_id = ? AND rev > ?").bind(userId, since),
  ]);
  // The catalog cursor trails by a minute: a row another request writes during this one is sent again, not missed
  return { rev: (rev.results[0] as { rev: number }).rev, catalogAt: now - 60_000, games: (rows.results as Row[]).map(r => toGame(r, communityOn(env))),
    views: (viewRows.results as ViewRow[]).map(toView), lists: (listRows.results as ListRow[]).map(toList),
    items: (itemRows.results as ItemRow[]).map(toItem) };
}
