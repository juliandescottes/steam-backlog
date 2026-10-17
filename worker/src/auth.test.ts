import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { testWorker } from "./testing.ts";

let w: Awaited<ReturnType<typeof testWorker>>;
beforeAll(async () => { w = await testWorker({ DEV_LOGIN: "true", STEAM_API_KEY: "key" }); });
afterAll(() => w.dispose());
afterEach(() => { vi.restoreAllMocks(); w.signOut(); });

const STEAM_ID = "76561197960287930";

/** Stubs Steam's OpenID check and player summary; other requests pass through. */
function stubSteam(valid: boolean) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://steamcommunity.com/openid/login") return new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`);
    if (url.startsWith("https://api.steampowered.com/ISteamUser/GetPlayerSummaries")) {
      return Response.json({ response: { players: [{ personaname: "Gabe", avatarfull: "https://avatars.example/g.jpg" }] } });
    }
    return real(input, init);
  });
}

function callback(overrides: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.return_to": "https://baquelogue.com/api/auth/callback",
    "openid.response_nonce": "2026-10-17T10:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2ln",
    ...Object.fromEntries(Object.entries(overrides).filter((e): e is [string, string] => e[1] != null)),
  });
  return `/api/auth/callback?${p}`;
}

describe("Steam sign-in", () => {
  test("redirects to Steam with our callback", async () => {
    const res = await w.call("GET", "/api/auth/steam");
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(to.searchParams.get("openid.return_to")).toBe("https://baquelogue.com/api/auth/callback");
    expect(to.searchParams.get("openid.realm")).toBe("https://baquelogue.com");
  });

  test("a verified callback creates the user and a session", async () => {
    const steam = stubSteam(true);
    const res = await w.call("GET", callback());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toMatch(/^sid=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
    const check = steam.mock.calls.find(([u]) => String(u) === "https://steamcommunity.com/openid/login")!;
    expect(new URLSearchParams(check[1]!.body as URLSearchParams).get("openid.mode")).toBe("check_authentication");

    const me = await (await w.call("GET", "/api/me")).json();
    expect(me).toMatchObject({ steamId: STEAM_ID, name: "Gabe", avatar: "https://avatars.example/g.jpg" });
  });

  test("signing in again keeps the same user", async () => {
    stubSteam(true);
    await w.call("GET", callback());
    const first = (await (await w.call("GET", "/api/me")).json()) as { id: string };
    w.signOut();
    await w.call("GET", callback());
    expect(await (await w.call("GET", "/api/me")).json()).toMatchObject({ id: first.id });
  });

  test("rejects callbacks Steam doesn't confirm, or that were tampered with", async () => {
    stubSteam(false);
    expect((await w.call("GET", callback())).headers.get("location")).toBe("/?signin=failed");
    stubSteam(true);
    for (const bad of [
      { "openid.return_to": "https://evil.example/api/auth/callback" },
      { "openid.op_endpoint": "https://evil.example/openid/login" },
      { "openid.claimed_id": "https://evil.example/openid/id/76561197960287930" },
      { "openid.mode": "cancel" },
    ]) {
      const res = await w.call("GET", callback(bad));
      expect(res.headers.get("location"), JSON.stringify(bad)).toBe("/?signin=failed");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});

describe("sessions", () => {
  test("signed out by default, and after logout", async () => {
    expect((await w.call("GET", "/api/me")).status).toBe(401);
    await w.call("POST", "/api/auth/dev", {});
    expect((await w.call("GET", "/api/me")).status).toBe(200);
    const out = await w.call("POST", "/api/auth/logout");
    expect(out.headers.get("set-cookie")).toMatch(/^sid=; .*Max-Age=0$/);
    expect((await w.call("GET", "/api/me")).status).toBe(401);
  });

  test("stores only a hash of the session token", async () => {
    const res = await w.call("POST", "/api/auth/dev", {});
    const token = res.headers.get("set-cookie")!.match(/^sid=([^;]*)/)![1];
    const rows = await w.env.DB.prepare("SELECT id FROM sessions").all<{ id: string }>();
    expect(rows.results.length).toBeGreaterThan(0);
    expect(rows.results.some(r => r.id === token)).toBe(false);
  });

  test("mutating requests need the X-Requested-With header", async () => {
    const res = await w.call("POST", "/api/auth/dev", {}, { "x-requested-with": "nope" });
    expect(res.status).toBe(403);
  });

  test("dev sign-in is off unless DEV_LOGIN is set", async () => {
    const prod = await testWorker();
    try {
      expect((await prod.call("POST", "/api/auth/dev", {})).status).toBe(404);
    } finally {
      await prod.dispose();
    }
  });
});
