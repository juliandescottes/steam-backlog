import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import worker from "./index.ts";

const MIGRATIONS = fileURLToPath(new URL("../migrations/", import.meta.url).href);

/** A fresh in-memory D1 with all migrations, and a client that keeps the session cookie. */
export async function testWorker(vars: Partial<Env> = {}) {
  const proxy = await getPlatformProxy<Env>({ persist: false });
  // .dev.vars must not leak into tests
  const env = { ...proxy.env, DEV_LOGIN: undefined, STEAM_API_KEY: undefined, TWITCH_CLIENT_ID: undefined, TWITCH_CLIENT_SECRET: undefined, ...vars } as Env;
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--.*$/gm, "");
    for (const stmt of sql.split(";").map(s => s.trim()).filter(Boolean)) await env.DB.prepare(stmt).run();
  }

  // waitUntil work is awaited by settle(), so tests see its effects
  const waiting: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waiting.push(p), passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  const settle = async () => { while (waiting.length) await waiting.shift(); };

  let sid: string | null = null;
  async function call(method: string, path: string, data?: unknown, headers: Record<string, string | undefined> = {}) {
    const h = new Headers(Object.entries(headers).filter((e): e is [string, string] => e[1] != null));
    if (method !== "GET") h.set("x-requested-with", h.get("x-requested-with") ?? "backlog");
    if (sid) h.set("cookie", `sid=${sid}`);
    if (data !== undefined) h.set("content-type", "application/json");
    const res = await worker.fetch(new Request(`https://baquelogue.com${path}`, {
      method, headers: h, body: data === undefined ? undefined : JSON.stringify(data), redirect: "manual",
    }), env, ctx);
    const set = res.headers.get("set-cookie")?.match(/^sid=([^;]*)/);
    if (set) sid = set[1] || null;
    return res;
  }

  return { env, call, settle, dispose: proxy.dispose, signOut: () => (sid = null) };
}
