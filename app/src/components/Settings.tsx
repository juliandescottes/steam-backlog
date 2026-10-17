import { useEffect, useRef, useState } from "preact/hooks";
import { makeExport, parseExport, parseLengths, parseLibrary, type ExportFile } from "@backlog/shared/files";
import type { Measure } from "@backlog/shared/types";
import {
  deleteEverything, games, importLengths, mergeLibrary, restoreBackup, settings, settingsOpen, showToast, updateSettings, type Theme,
} from "../store.ts";
import { download, readFile } from "../util.ts";

function FilePick({ label, accept, onFile }: { label: string; accept: string; onFile: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" class="btn" onClick={() => input.current?.click()}>{label}</button>
      <input ref={input} type="file" accept={accept} hidden onChange={async e => {
        const f = e.currentTarget.files?.[0];
        e.currentTarget.value = "";
        if (f) onFile(await readFile(f));
      }} />
    </>
  );
}

function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={name}>
      {options.map(([v, label]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function Settings() {
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<ExportFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const s = settings.value;

  useEffect(() => close.current?.focus(), []);
  const guard = (fn: (text: string) => void) => (text: string) => {
    setError(null);
    try { fn(text); } catch (e: any) { setError(e.message); }
  };

  const exportNow = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`backlog-${stamp}.json`, makeExport([...games.value.values()], s));
  };

  return (
    <div class="sheet-backdrop" onClick={ev => ev.target === ev.currentTarget && (settingsOpen.value = false)}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button ref={close} type="button" class="btn ghost close" onClick={() => (settingsOpen.value = false)} aria-label="Close">✕</button>
        <h2 id="settings-title">Settings</h2>

        <section class="detail-section">
          <h3>Theme</h3>
          <Radio<Theme> name="Theme" value={s.theme} onChange={theme => updateSettings({ theme })}
            options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} />
        </section>

        <section class="detail-section">
          <h3>Sort and total by</h3>
          <Radio<Measure> name="Length measure" value={s.measure} onChange={measure => updateSettings({ measure })}
            options={[["main_extra", "Main + Extras"], ["main", "Main story"]]} />
        </section>

        <section class="detail-section">
          <h3>Library</h3>
          <p class="hint">Steam import arrives with accounts. Until then, open a library file made by <code>npm run library</code>.</p>
          <p class="row-actions">
            <FilePick label="Open library file" accept=".json,application/json" onFile={guard(text => {
              const r = mergeLibrary(parseLibrary(text));
              showToast(`${r.added} games added, ${r.updated} updated`);
            })} />
            <FilePick label="Import lengths" accept=".json,.csv,application/json,text/csv" onFile={guard(text => {
              const r = importLengths(parseLengths(text));
              if (r.unknownGames) showToast(`Imported ${r.applied} lengths (${r.unknownGames} for games not in your library)`, true);
            })} />
          </p>
          <p class="hint">Lengths files: JSON (<code>backlog-lengths</code>) or CSV with an <code>appid</code> column and <code>hours</code> or <code>main</code>, <code>main_extra</code>, <code>completionist</code>. They become your own lengths.</p>
        </section>

        <section class="detail-section">
          <h3>Backup</h3>
          <p class="row-actions">
            <button type="button" class="btn" onClick={exportNow}>Export backup</button>
            <FilePick label="Restore backup" accept=".json,application/json" onFile={guard(text => setBackup(parseExport(text)))} />
          </p>
          {backup && (
            <div class="callout">
              <p>Backup from {new Date(backup.exportedAt).toLocaleString()}: {backup.games.length} games,{" "}
                {backup.games.filter(g => g.status !== "backlog").length} with a status, {backup.games.filter(g => g.myKind).length} with your own length.</p>
              <p class="row-actions">
                <button type="button" class="btn primary" onClick={async () => {
                  await restoreBackup(backup.games, "merge", backup.settings as any); setBackup(null); showToast("Backup merged");
                }}>Merge into this library</button>
                <button type="button" class="btn" onClick={async () => {
                  await restoreBackup(backup.games, "replace", backup.settings as any); setBackup(null); showToast("Library replaced from backup");
                }}>Replace this library</button>
                <button type="button" class="btn ghost" onClick={() => setBackup(null)}>Cancel</button>
              </p>
            </div>
          )}
        </section>

        {error && <p class="error" role="alert">{error}</p>}

        <section class="detail-section">
          <h3>Local data</h3>
          {confirmDelete
            ? <p class="row-actions">
                <span>This removes your library, statuses and lengths from this browser. Export a backup first.</span>
                <button type="button" class="btn danger" onClick={() => void deleteEverything()}>Delete everything</button>
                <button type="button" class="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </p>
            : <button type="button" class="btn ghost" onClick={() => setConfirmDelete(true)}>Delete local data…</button>}
        </section>
      </div>
    </div>
  );
}
