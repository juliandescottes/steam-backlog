import { useState } from "preact/hooks";
import { FileFormatError, parseExport, parseLibrary } from "@backlog/shared/files";
import { mergeLibrary, restoreBackup } from "../store.ts";
import { readFile } from "../util.ts";

/** First run: open a library file (or a backup) until Steam import exists. */
export function Welcome() {
  const [error, setError] = useState<string | null>(null);
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
        <p class="lede">Your games, shortest first. Statuses in one click, everything stays fast because it all lives in your browser.</p>
      </header>
      <label class={`drop${over ? " over" : ""}`}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void open(e.dataTransfer?.files[0]); }}>
        <input type="file" accept=".json,application/json" hidden onChange={e => void open(e.currentTarget.files?.[0])} />
        <b>Open a library file</b>
        <span>Drop it here or click to choose. A backup works too.</span>
      </label>
      {error && <p class="error" role="alert">{error}</p>}
      <p class="hint">Sign in with Steam comes later. For now, make a library file from the prototype data with <code>npm run library</code>; it writes <code>tools/out/library.json</code> and <code>tools/out/hltb_lengths.json</code>.</p>
    </div>
  );
}
