import { compare, matches, type Entry, type Filter, type SortKey } from "@backlog/shared/filter";
import { resolveLength } from "@backlog/shared/lengths";
import type { ListKind } from "@backlog/shared/lists";
import { normalizeName } from "@backlog/shared/names";
import { SHARE_ID } from "@backlog/shared/lists";
import { HANDLE, type SharedList } from "@backlog/shared/share";
import type { Game } from "@backlog/shared/types";
import { HttpError } from "./http.ts";
import { GAME_COLUMNS, toGame, type Row } from "./sync.ts";

/** Sets the user's public username (profiles); another user's handle is refused. */
export async function setHandle(env: Env, userId: string, handle: unknown): Promise<string> {
  if (typeof handle !== "string" || !HANDLE.test(handle)) throw new HttpError(400, "bad_handle");
  try {
    await env.DB.prepare("UPDATE users SET handle = ? WHERE id = ?").bind(handle, userId).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "handle_taken");
    throw e;
  }
  return handle;
}

type ListRow = {
  user_id: string; display_name: string; avatar_url: string | null; rev: number;
  id: string; title: string; description: string; kind: ListKind; filter_json: string | null; sort: SortKey | null;
};

/** What viewers may see of a game: lengths and status. */
const forViewers = (g: Game): Game => ({ ...g, note: "", playtimeMin: 0, lastPlayedAt: null, addedAt: 0, statusAt: null, finishedAt: null });

/**
 * A list shared by link or on a profile, with an ETag that changes when the owner changes anything
 * (their rev) or a game's catalog row does. Null for private, deleted and missing lists alike.
 */
export async function sharedList(env: Env, shareId: string): Promise<{ etag: string; data: SharedList } | null> {
  if (!SHARE_ID.test(shareId)) return null;
  const l = await env.DB.prepare(
    `SELECT u.id AS user_id, u.display_name, u.avatar_url, r.rev, l.id, l.title, l.description, l.kind, l.filter_json, l.sort
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
    games = rows.map(toGame)
      .map((game): Entry => ({ game, len: resolveLength(game, "main_extra"), key: normalizeName(game.name) }))
      .filter(e => matches(e, filter)).sort(compare(l.sort ?? "length")).map(e => e.game);
  }
  // A sum, not the latest: any one game's catalog row changing changes it
  const catalog = rows.reduce((sum, r) => sum + r.updated_at, 0);
  return {
    etag: `"${l.rev}-${catalog}-${games.length}"`,
    data: {
      owner: { name: l.display_name, avatar: l.avatar_url },
      list: { title: l.title, description: l.description, kind: l.kind, sort: l.sort },
      games: games.map(forViewers),
    },
  };
}

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The app's page with the list's title and a preview for chats and social sites (Open Graph). */
export async function sharePage(env: Env, req: Request, url: URL): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL("/", url), req));
  const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
  const share = m ? await sharedList(env, m[1]) : null;
  if (!share || !page.ok) return page;
  const { list, owner, games } = share.data;
  const hours = Math.round(games.reduce((s, g) => s + (resolveLength(g, "main_extra").hours ?? 0), 0));
  const title = `${list.title} · ${owner.name}`;
  const description = list.description || `${games.length} game${games.length === 1 ? "" : "s"} · ${hours} h`;
  const tags = [
    `<title>${escape(title)}</title>`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta name="description" content="${escape(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escape(url.href)}">`,
    ...(games[0] ? [`<meta property="og:image" content="https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${games[0].appid}/header.jpg">`,
      `<meta name="twitter:card" content="summary_large_image">`] : []),
  ].join("\n  ");
  const html = (await page.text()).replace(/<title>[^<]*<\/title>/, tags);
  const headers = new Headers(page.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("cache-control", "no-cache");
  return new Response(html, { status: 200, headers });
}
