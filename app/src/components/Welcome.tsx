import { useState } from "preact/hooks";
import { FileFormatError, parseExport, parseLibrary } from "@backlog/shared/files";
import { signIn } from "../account.ts";
import { mergeLibrary, restoreBackup } from "../store.ts";
import { readFile } from "../util.ts";
import { Brand } from "./Brand.tsx";

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
        await restoreBackup(b, "replace");
      } catch {
        setError("That file isn't a library file or a backup.");
      }
    }
  };

  return (
    <div class="wrap welcome">
      <header class="top">
        <div class="eyebrow-row"><Brand /></div>
        <h1>Your backlog,<br /><em>shortest first</em></h1>
        <p class="lede">Baquelogue sorts your Steam games by how long they take to complete, so you can pick something you'll actually finish. Mark games as playing, finished or dropped in one click, and share your whole backlog or just the lists you pick.</p>
      </header>
      <div class="option">
        <p class="row-actions">
          <button type="button" class="btn primary steam" onClick={signIn}>Sign in with Steam</button>
          {import.meta.env.DEV && <button type="button" class="btn ghost" onClick={devSignIn}>Dev sign-in</button>}
        </p>
        <p class="hint">We import your games and keep them in sync. Your Steam profile's game details need to be public.</p>
      </div>
      {error && <p class="error" role="alert">{error}</p>}
      <div class="option">
        <h2 class="or">No account?</h2>
        <label class={`drop${over ? " over" : ""}`}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); void open(e.dataTransfer?.files[0]); }}>
          <input type="file" accept=".json,application/json" hidden onChange={e => void open(e.currentTarget.files?.[0])} />
          <span class="btn">Open a backup</span>
          <span class="hint">or drop it here.</span>
        </label>
        <p class="hint">Everything stays in this browser. Sharing needs an account.</p>
      </div>
    </div>
  );
}
