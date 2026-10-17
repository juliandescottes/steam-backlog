// Secrets and dev settings (wrangler secret put / .dev.vars); bindings are in worker-configuration.d.ts
interface Env {
  STEAM_API_KEY?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  /** "true" enables POST /api/auth/dev, a sign-in that skips Steam. Local development only. */
  DEV_LOGIN?: string;
}
