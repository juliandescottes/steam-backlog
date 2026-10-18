import { deleteAccount, setSharing } from "./community.ts";
import { clearCookie, createSession, currentUser, endSession, requireUser, upsertUser, type User } from "./auth.ts";
import { body, HttpError, json, redirect } from "./http.ts";
import { enrich } from "./igdb.ts";
import { refreshLibrary } from "./library.ts";
import { loginUrl, playerSummary, verifyCallback } from "./steam.ts";
import { profile, setProfile, sharedBacklog, sharedList, sharePage, type ProfileSettings } from "./share.ts";
import { sync } from "./sync.ts";
import type { SyncRequest } from "@backlog/shared/sync";

const me = (u: User) => ({
  id: u.id, steamId: u.steam_id, handle: u.handle, name: u.display_name, avatar: u.avatar_url, librarySyncedAt: u.library_synced_at,
  shareLengths: JSON.parse(u.settings_json).shareLengths !== false,
  profilePublic: u.profile_public === 1,
  showBacklog: JSON.parse(u.settings_json).showBacklog === true,
});

async function route(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const at = `${req.method} ${url.pathname}`;

  // Forms can't set this header, so it blocks cross-site form posts on top of SameSite cookies
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers.get("x-requested-with") !== "backlog") {
    throw new HttpError(403, "missing_header");
  }

  const shared = req.method === "GET" && url.pathname.match(/^\/api\/(?:s\/([^/]+)|u\/([^/]+)\/backlog)$/);
  if (shared) {
    const r = shared[1] ? await sharedList(env, shared[1]) : await sharedBacklog(env, decodeURIComponent(shared[2]));
    if (!r) throw new HttpError(404, "not_found");
    const headers = { etag: r.etag, "cache-control": "no-cache" };
    if (req.headers.get("if-none-match") === r.etag) return new Response(null, { status: 304, headers });
    return json(r.data, { headers });
  }
  const user = req.method === "GET" && url.pathname.match(/^\/api\/u\/([^/]+)$/);
  if (user) {
    const p = await profile(env, decodeURIComponent(user[1]));
    if (!p) throw new HttpError(404, "not_found");
    return json(p, { headers: { "cache-control": "no-cache" } });
  }

  switch (at) {
    case "GET /api/auth/steam":
      return redirect(loginUrl(url.origin));

    case "GET /api/auth/callback": {
      const steamId = await verifyCallback(url);
      if (!steamId) return redirect("/?signin=failed");
      const userId = await upsertUser(env, steamId, await playerSummary(env, steamId));
      return redirect("/", { "set-cookie": await createSession(env, userId) });
    }

    case "POST /api/auth/dev": {
      if (env.DEV_LOGIN !== "true") throw new HttpError(404, "not_found");
      const { steamId = "76561190000000001", name = "Dev user" } = await body<{ steamId?: string; name?: string }>(req);
      const userId = await upsertUser(env, steamId, (await playerSummary(env, steamId)) ?? { name, avatar: null });
      return json({ ok: true }, { headers: { "set-cookie": await createSession(env, userId) } });
    }

    case "POST /api/auth/logout":
      await endSession(req, env);
      return json({ ok: true }, { headers: { "set-cookie": clearCookie() } });

    case "POST /api/library/refresh": {
      const { user } = await requireUser(req, env);
      const r = await refreshLibrary(env, user.id, user.steam_id);
      if (r.added) ctx.waitUntil(enrich(env)); // new games get lengths without waiting for the cron
      return json(r);
    }

    case "POST /api/sync": {
      const { user } = await requireUser(req, env);
      return json(await sync(env, user.id, await body<SyncRequest>(req)));
    }

    case "POST /api/settings": {
      const { user } = await requireUser(req, env);
      const { shareLengths } = await body<{ shareLengths?: unknown }>(req);
      if (typeof shareLengths !== "boolean") throw new HttpError(400, "bad_request");
      await setSharing(env, user.id, shareLengths);
      return json({ shareLengths });
    }

    case "POST /api/profile": {
      const { user } = await requireUser(req, env);
      await setProfile(env, user.id, await body<ProfileSettings>(req));
      return json({ ok: true });
    }

    case "DELETE /api/account": {
      const { user } = await requireUser(req, env);
      await deleteAccount(env, user.id);
      return json({ ok: true }, { headers: { "set-cookie": clearCookie() } });
    }

    case "GET /api/me": {
      const s = await currentUser(req, env);
      if (!s) throw new HttpError(401, "signed_out");
      return json(me(s.user), s.setCookie ? { headers: { "set-cookie": s.setCookie } } : undefined);
    }
  }
  throw new HttpError(404, "not_found");
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (/^\/[lsu]\//.test(url.pathname)) {
      try {
        return await sharePage(env, req, url);
      } catch (e) {
        console.error(e);
        return env.ASSETS.fetch(new Request(new URL("/", url), req));
      }
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, { status: e.status });
      console.error(e);
      return json({ error: "internal" }, { status: 500 });
    }
  },

  async scheduled(_controller, env) {
    await enrich(env);
  },
} satisfies ExportedHandler<Env>;
