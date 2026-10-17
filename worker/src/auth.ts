import { cookie, HttpError, randomId, sha256 } from "./http.ts";

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;
const COOKIE = "sid";

export type User = {
  id: string;
  steam_id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  library_synced_at: number | null;
};

const sessionCookie = (value: string, maxAgeSec: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

export const clearCookie = () => sessionCookie("", 0);

/** Starts a session and returns its Set-Cookie header. */
export async function createSession(env: Env, userId: string, now = Date.now()): Promise<string> {
  const token = randomId(32);
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, now + SESSION_DAYS * DAY).run();
  return sessionCookie(token, SESSION_DAYS * DAY / 1000);
}

/**
 * The signed-in user, or null. Sessions are extended on use, at most once a day;
 * `setCookie` is then the refreshed cookie to send back.
 */
export async function currentUser(req: Request, env: Env, now = Date.now()): Promise<{ user: User; setCookie?: string } | null> {
  const token = cookie(req, COOKIE);
  if (!token) return null;
  const id = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.steam_id, u.handle, u.display_name, u.avatar_url, u.library_synced_at, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
  ).bind(id, now).first<User & { expires_at: number }>();
  if (!row) return null;
  const { expires_at, ...user } = row;
  if (expires_at - now > (SESSION_DAYS - 1) * DAY) return { user };
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(now + SESSION_DAYS * DAY, id).run();
  return { user, setCookie: sessionCookie(token, SESSION_DAYS * DAY / 1000) };
}

export async function requireUser(req: Request, env: Env) {
  const s = await currentUser(req, env);
  if (!s) throw new HttpError(401, "signed_out");
  return s;
}

export async function endSession(req: Request, env: Env) {
  const token = cookie(req, COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
}

export type Profile = { name: string; avatar: string | null };

/** Creates the user on first sign-in; refreshes name and avatar when a profile is given. */
export async function upsertUser(env: Env, steamId: string, profile: Profile | null, now = Date.now()): Promise<string> {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE steam_id = ?").bind(steamId).first<{ id: string }>();
  if (existing) {
    if (profile) {
      await env.DB.prepare("UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?")
        .bind(profile.name, profile.avatar, existing.id).run();
    }
    return existing.id;
  }
  const id = randomId();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, steam_id, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, steamId, profile?.name ?? `Steam user ${steamId}`, profile?.avatar ?? null, now),
    env.DB.prepare("INSERT INTO user_rev (user_id, rev) VALUES (?, 0)").bind(id),
  ]);
  return id;
}
