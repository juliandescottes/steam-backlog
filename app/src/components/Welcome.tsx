import { useState } from "preact/hooks";
import { FileFormatError, parseExport, parseLibrary } from "@backlog/shared/files";
import { signIn } from "../account.ts";
import { mergeLibrary, restoreBackup } from "../store.ts";
import { readFile } from "../util.ts";
import { Brand } from "./Brand.tsx";
import { TIMED_BANDS } from "@backlog/shared/bands";

/** npm run dev:api only: signs in without Steam. */
async function devSignIn() {
  await fetch("/api/auth/dev", { method: "POST", headers: { "x-requested-with": "backlog", "content-type": "application/json" }, body: "{}" });
  location.reload();
}

const signInFailed = new URLSearchParams(location.search).get("signin") === "failed";

/** A made-up backlog's length bar, as a divider. */
const SAMPLE = [24, 41, 37, 52, 30, 14, 6];

/** First run: sign in with Steam. */
export function Welcome() {
  const [error, setError] = useState<string | null>(signInFailed ? "Steam sign-in didn't go through. Try again?" : null);
  const [over, setOver] = useState(false);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const text = await readFile(file);
    try {
      mergeLibrary(parseLibrary(text));
    } catch (e) {
      if (!(e instanceof FileFormatError)) throw e;
      try {
        const b = parseExport(text);
        await restoreBackup(b, "replace");
      } catch {
        setError("That file isn't a library file or a backup.");
      }
    }
  };

  // No visible way in without an account: a file dropped on the page still opens, for local use and tests (ONB-1)
  return (
    <div class={`wrap welcome${over ? " over" : ""}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={e => e.currentTarget === e.target && setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); void open(e.dataTransfer?.files[0]); }}>
      <header class="top">
        <div class="eyebrow-row"><Brand /></div>
        <h1>Your backlog,<br /><em>shortest first</em></h1>
        <p class="lede">Baquelogue sorts your Steam games by how long they take to complete, so you can pick something you'll actually finish.</p>
      </header>
      <div class="cta">
        <button type="button" class="btn primary steam" onClick={signIn}>Sign in with Steam</button>
        <p class="hint">We import your games and keep them in sync. Your Steam profile's game details need to be public.</p>
        {import.meta.env.DEV && <button type="button" class="btn ghost dev" onClick={devSignIn}>Dev sign-in</button>}
      </div>
      {error && <p class="error" role="alert">{error}</p>}
      <div class="bar sample" aria-hidden="true">{TIMED_BANDS.map((b, i) => <span key={b.id} style={{ flex: SAMPLE[i], background: `var(${b.color})` }} />)}</div>
      <ul class="features">
        <li><b>Sort.</b>Sort by duration, from a lunch break to a whole season.<span>Clear your backlog at your own pace, one game at a time.</span></li>
        <li><b>Click.</b>One click to mark games Playing, Finished or Dropped.<span>Your library lives in your browser, so every click is instant.</span></li>
        <li><b>Share.</b>Share your whole backlog or <span class="nowrap">hand-crafted</span> lists.<span>Send a list to friends and let them help pick your next game.</span></li>
      </ul>
      <input type="file" accept=".json,application/json" hidden onChange={e => void open(e.currentTarget.files?.[0])} />
    </div>
  );
}
