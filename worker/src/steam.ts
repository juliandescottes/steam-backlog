import type { Profile } from "./auth.ts";

/** Steam OpenID 2.0 (TECH.md §6). */
const OPENID = "https://steamcommunity.com/openid/login";
const NS = "http://specs.openid.net/auth/2.0";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export const callbackPath = "/api/auth/callback";

export function loginUrl(origin: string): string {
  const p = new URLSearchParams({
    "openid.ns": NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": origin + callbackPath,
    "openid.realm": origin,
    "openid.identity": `${NS}/identifier_select`,
    "openid.claimed_id": `${NS}/identifier_select`,
  });
  return `${OPENID}?${p}`;
}

/** Checks a callback with Steam and returns the SteamID64, or null when it doesn't verify. */
export async function verifyCallback(url: URL): Promise<string | null> {
  const p = url.searchParams;
  const steamId = CLAIMED_ID.exec(p.get("openid.claimed_id") ?? "")?.[1];
  if (p.get("openid.mode") !== "id_res" || p.get("openid.op_endpoint") !== OPENID || !steamId) return null;
  if (p.get("openid.return_to")?.split("?")[0] !== url.origin + callbackPath) return null;

  const check = new URLSearchParams(p);
  check.set("openid.mode", "check_authentication");
  const res = await fetch(OPENID, { method: "POST", body: check });
  if (!res.ok) return null;
  return /^is_valid\s*:\s*true$/m.test(await res.text()) ? steamId : null;
}

/** Persona name and avatar; null without an API key or when Steam doesn't answer. */
export async function playerSummary(env: Env, steamId: string): Promise<Profile | null> {
  if (!env.STEAM_API_KEY) return null;
  const res = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${steamId}`);
  if (!res.ok) return null;
  const p = ((await res.json()) as { response?: { players?: { personaname?: string; avatarfull?: string }[] } }).response?.players?.[0];
  return p?.personaname ? { name: p.personaname, avatar: p.avatarfull ?? null } : null;
}
