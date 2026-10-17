import { useState } from "preact/hooks";
import { FileFormatError, parseExport, parseLibrary } from "@backlog/shared/files";
import { signIn } from "../account.ts";
import { mergeLibrary, restoreBackup } from "../store.ts";
import { readFile } from "../util.ts";

/** npm run dev:api only: signs in without Steam. */
async function devSignIn() {
  await fetch("/api/auth/dev", { method: "POST", headers: { "x-requested-with": "backlog", "content-type": "application/json" }, body: "{}" });
  location.reload();
}

const signInFailed = new URLSearchParams(location.search).get("signin") === "failed";

/** First run: sign in with Steam, or stay local with a library file (or a backup). */
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
        await restoreBackup(b.games, "replace", b.settings as any);
      } catch {
        setError("That file isn't a library file or a backup.");
      }
    }
  };

  return (
    <div class="wrap welcome">
      <header class="top">
        <div class="eyebrow">Backlog</div>
        <h1>What can you <em>finish</em> this weekend?</h1>
        <p class="lede">Your Steam games, shortest first. Statuses in one click, and everything stays fast because your library lives in your browser.</p>
      </header>
      <p class="row-actions">
        <button type="button" class="btn primary steam" onClick={signIn}>Sign in with Steam</button>
        <span class="hint">Imports your library. Steam only shares it when your profile's game details are public.</span>
        {import.meta.env.DEV && <button type="button" class="btn ghost" onClick={devSignIn}>Dev sign-in</button>}
      </p>
      {error && <p class="error" role="alert">{error}</p>}
      <h2 class="or">Or stay local</h2>
      <label class={`drop${over ? " over" : ""}`}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void open(e.dataTransfer?.files[0]); }}>
        <input type="file" accept=".json,application/json" hidden onChange={e => void open(e.currentTarget.files?.[0])} />
        <b>Open a library file</b>
        <span>Drop it here or click to choose. A backup works too.</span>
      </label>
      <p class="hint">Without an account nothing leaves this browser. A library file comes from <code>npm run library</code> in the repo.</p>
    </div>
  );
}
