import { compare, matches, type Entry, type Filter, type SortKey } from "@backlog/shared/filter";
import { resolveLength } from "@backlog/shared/lengths";
import type { ListKind } from "@backlog/shared/lists";
import { normalizeName } from "@backlog/shared/names";
import { SHARE_ID } from "@backlog/shared/lists";
import { HANDLE, type Profile, type SharedList } from "@backlog/shared/share";
import type { Game } from "@backlog/shared/types";
import { HttpError } from "./http.ts";
import { GAME_COLUMNS, toGame, type Row } from "./sync.ts";

export type ProfileSettings = { handle?: unknown; public?: unknown; showStats?: unknown };

/**
 * Public profile settings: the handle (public username; another user's is refused), whether the profile
 * is on (needs a handle), and whether it shows stats.
 */
export async function setProfile(env: Env, userId: string, s: ProfileSettings) {
  if (s.handle !== undefined && (typeof s.handle !== "string" || !HANDLE.test(s.handle))) throw new HttpError(400, "bad_handle");
  if ((s.public !== undefined && typeof s.public !== "boolean") || (s.showStats !== undefined && typeof s.showStats !== "boolean")) {
    throw new HttpError(400, "bad_request");
  }
  try {
    const r = await env.DB.prepare(
      `UPDATE users SET handle = coalesce(?2, handle), profile_public = coalesce(?3, profile_public),
         settings_json = CASE WHEN ?4 IS NULL THEN settings_json ELSE json_set(settings_json, '$.showStats', json(?4)) END
       WHERE id = ?1 AND (coalesce(?3, profile_public) = 0 OR coalesce(?2, handle) IS NOT NULL)`,
    ).bind(userId, s.handle ?? null, s.public === undefined ? null : Number(s.public), s.showStats === undefined ? null : String(s.showStats)).run();
    if (!r.meta.changes) throw new HttpError(400, "handle_required");
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "handle_taken");
    throw e;
  }
}

type ListRow = {
  user_id: string; display_name: string; avatar_url: string | null; handle: string | null; profile_public: number; rev: number;
  id: string; title: string; description: string; kind: ListKind; filter_json: string | null; sort: SortKey | null;
};

const entry = (game: Game): Entry => ({ game, len: resolveLength(game, "main_extra"), key: normalizeName(game.name) });

/** What viewers may see of a game: lengths and status. */
const forViewers = (g: Game): Game => ({ ...g, note: "", playtimeMin: 0, lastPlayedAt: null, addedAt: 0, statusAt: null, finishedAt: null });

/**
 * A list shared by link or on a profile, with an ETag that changes when the owner changes anything
 * (their rev) or a game's catalog row does. Null for private, deleted and missing lists alike.
 */
export async function sharedList(env: Env, shareId: string): Promise<{ etag: string; data: SharedList } | null> {
  if (!SHARE_ID.test(shareId)) return null;
  const l = await env.DB.prepare(
    `SELECT u.id AS user_id, u.display_name, u.avatar_url, u.handle, u.profile_public, r.rev, l.id, l.title, l.description, l.kind, l.filter_json, l.sort
     FROM lists l JOIN users u ON u.id = l.user_id JOIN user_rev r ON r.user_id = u.id
     WHERE l.share_id = ? AND l.visibility != 'private' AND l.deleted = 0`,
  ).bind(shareId).first<ListRow>();
  if (!l) return null;

  let rows: (Row & { updated_at: number })[];
  let games: Game[];
  if (l.kind === "manual") {
    rows = (await env.DB.prepare(
      `SELECT ${GAME_COLUMNS}, g.updated_at FROM list_items li JOIN games g ON g.appid = li.appid
       LEFT JOIN user_games ug ON ug.user_id = ?1 AND ug.appid = li.appid
       WHERE li.list_id = ?2 AND li.deleted = 0 ORDER BY li.position`,
    ).bind(l.user_id, l.id).all<Row & { updated_at: number }>()).results;
    games = rows.map(r => toGame({ ...r, status: r.status ?? "backlog", note: r.note ?? "", playtime_min: r.playtime_min ?? 0, first_seen_at: r.first_seen_at ?? 0 }));
  } else {
    // Filter lists are computed here with the client's filter code; lengths by Main + Extras, the default measure
    rows = (await env.DB.prepare(`SELECT ${GAME_COLUMNS}, g.updated_at FROM user_games ug JOIN games g USING (appid) WHERE ug.user_id = ?`)
      .bind(l.user_id).all<Row & { updated_at: number }>()).results;
    const filter: Filter = l.filter_json ? JSON.parse(l.filter_json) : {};
    games = rows.map(r => entry(toGame(r)))
      .filter(e => matches(e, filter)).sort(compare(l.sort ?? "length")).map(e => e.game);
  }
  // A sum, not the latest: any one game's catalog row changing changes it
  const catalog = rows.reduce((sum, r) => sum + r.updated_at, 0);
  return {
    etag: `"${l.rev}-${catalog}-${games.length}"`,
    data: {
      owner: { name: l.display_name, avatar: l.avatar_url, handle: l.profile_public ? l.handle : null },
      list: { title: l.title, description: l.description, kind: l.kind, sort: l.sort },
      games: games.map(forViewers),
    },
  };
}

/** A public profile, or null when it's off or there's no such handle. */
export async function profile(env: Env, handle: string): Promise<Profile | null> {
  if (!HANDLE.test(handle)) return null;
  const u = await env.DB.prepare("SELECT id, display_name, avatar_url, settings_json FROM users WHERE handle = ? AND profile_public = 1")
    .bind(handle).first<{ id: string; display_name: string; avatar_url: string | null; settings_json: string }>();
  if (!u) return null;
  const [lists, rows, items] = await env.DB.batch<any>([
    env.DB.prepare(
      `SELECT id, share_id, title, description, kind, filter_json, sort FROM lists
       WHERE user_id = ? AND visibility = 'profile' AND deleted = 0 ORDER BY position`,
    ).bind(u.id),
    env.DB.prepare(`SELECT ${GAME_COLUMNS} FROM user_games ug JOIN games g USING (appid) WHERE ug.user_id = ?`).bind(u.id),
    env.DB.prepare(
      `SELECT li.list_id, li.appid FROM list_items li JOIN lists l ON l.id = li.list_id
       WHERE l.user_id = ? AND l.visibility = 'profile' AND l.deleted = 0 AND li.deleted = 0 ORDER BY li.position`,
    ).bind(u.id),
  ]);
  const all = (rows.results as Row[]).map(r => entry(toGame(r)));
  const byAppid = new Map(all.map(e => [e.game.appid, e]));
  const finished = all.filter(e => e.game.status === "finished");
  const hoursOf = (es: Entry[]) => Math.round(es.reduce((s, e) => s + (e.len.hours ?? 0), 0));

  type Row2 = { id: string; share_id: string; title: string; description: string; kind: ListKind; filter_json: string | null; sort: SortKey | null };
  return {
    handle, name: u.display_name, avatar: u.avatar_url,
    stats: JSON.parse(u.settings_json).showStats === false ? null : { finished: finished.length, hoursCleared: hoursOf(finished) },
    lists: (lists.results as Row2[]).map(l => {
      const appids = l.kind === "manual"
        ? (items.results as { list_id: string; appid: number }[]).filter(i => i.list_id === l.id).map(i => i.appid)
        : all.filter(e => matches(e, l.filter_json ? JSON.parse(l.filter_json) : {})).sort(compare(l.sort ?? "length")).map(e => e.game.appid);
      const known = appids.map(id => byAppid.get(id)).filter((e): e is Entry => !!e);
      return { shareId: l.share_id, title: l.title, description: l.description, kind: l.kind, games: appids.length, hours: hoursOf(known), covers: appids.slice(0, 4) };
    }),
  };
}

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Title, description and image for a list or profile page, or null when there's nothing public there. */
async function preview(env: Env, path: string): Promise<{ title: string; description: string; image: number | null } | null> {
  const l = path.match(/^\/[ls]\/([^/]+)\/?$/);
  if (l) {
    const share = await sharedList(env, l[1]);
    if (!share) return null;
    const { list, owner, games } = share.data;
    const hours = Math.round(games.reduce((s, g) => s + (resolveLength(g, "main_extra").hours ?? 0), 0));
    return { title: `${list.title} · ${owner.name}`, description: list.description || `${plural(games.length, "game")} · ${hours} h`, image: games[0]?.appid ?? null };
  }
  const u = path.match(/^\/u\/([^/]+)\/?$/);
  const p = u ? await profile(env, u[1]) : null;
  if (!p) return null;
  return {
    title: `${p.name} on Backlog`,
    description: [plural(p.lists.length, "list"), p.stats && `${p.stats.finished} finished`].filter(Boolean).join(" · "),
    image: p.lists[0]?.covers[0] ?? null,
  };
}

/** The app's page with a title and a preview for chats and social sites (Open Graph): list and profile pages. */
export async function sharePage(env: Env, req: Request, url: URL): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL("/", url), req));
  const p = page.ok ? await preview(env, url.pathname) : null;
  if (!p) return page;
  const { title, description, image } = p;
  const tags = [
    `<title>${escape(title)}</title>`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta name="description" content="${escape(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escape(url.href)}">`,
    ...(image != null ? [`<meta property="og:image" content="https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${image}/header.jpg">`,
      `<meta name="twitter:card" content="summary_large_image">`] : []),
  ].join("\n  ");
  const html = (await page.text()).replace(/<title>[^<]*<\/title>/, tags);
  const headers = new Headers(page.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("cache-control", "no-cache");
  return new Response(html, { status: 200, headers });
}
