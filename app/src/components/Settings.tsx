import { useEffect, useRef, useState } from "preact/hooks";
import { parseExport, parseLibrary, type ExportFile } from "@backlog/shared/files";
import type { Measure } from "@backlog/shared/types";
import { profilePath, suggestHandle } from "@backlog/shared/share";
import { account, deleteAccount, refreshLibrary, setProfile, signIn, signOut, type Me } from "../account.ts";
import { navigate } from "../route.ts";
import {
  deleteEverything, exportBackup, games, mergeLibrary, restoreBackup, settings, settingsOpen, showToast, updateSettings, type Theme,
} from "../store.ts";
import { count, readFile } from "../util.ts";

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

/** The public profile at /u/<handle>: off by default; turning it on needs a username. */
function ProfileSettings({ me }: { me: Me }) {
  const [handle, setHandle] = useState(me.handle ?? suggestHandle(me.name));
  const [error, setError] = useState<string | null>(null);
  const save = async (change: Parameters<typeof setProfile>[0]) => setError(await setProfile(change));
  const typed = handle.trim().toLowerCase();
  return (
    <>
      <label class="check">
        <input type="checkbox" checked={me.profilePublic}
          onChange={e => void save(e.currentTarget.checked ? { profilePublic: true, ...(typed !== me.handle ? { handle: typed } : {}) } : { profilePublic: false })} />
        Public profile
      </label>
      <form class="row-actions handle" onSubmit={e => { e.preventDefault(); void save({ handle: typed }); }}>
        <label for="handle">Username</label>
        <span class="prefix">{location.host}/u/</span>
        <input id="handle" value={handle} maxLength={30} autoComplete="off" placeholder="your-name" onInput={e => setHandle(e.currentTarget.value)} />
        {me.handle && typed !== me.handle && <button type="submit" class="btn">Save</button>}
      </form>
      {error && <p class="error" role="alert">{error}</p>}
      <label class="check">
        <input type="checkbox" checked={me.showBacklog} disabled={!me.profilePublic} onChange={e => void save({ showBacklog: e.currentTarget.checked })} />
        Show my whole backlog
      </label>
      <p class="hint">
        Shows your Steam name and avatar, games finished and hours cleared, and the lists you pick in their Share panel. The whole backlog shows every game with its length and status, never notes or playtime. Changing the username breaks old profile links.
        {me.profilePublic && me.handle && <> <a href={profilePath(me.handle)} onClick={e => { e.preventDefault(); settingsOpen.value = false; navigate(profilePath(me.handle!)); }}>View your profile →</a></>}
      </p>
    </>
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

  return (
    <div class="sheet-backdrop" onClick={ev => ev.target === ev.currentTarget && (settingsOpen.value = false)}>
      <div class="sheet settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button ref={close} type="button" class="btn ghost close" onClick={() => (settingsOpen.value = false)} aria-label="Close">✕</button>
        <h2 id="settings-title">Settings</h2>

        <section class="detail-section">
          <h3>Account</h3>
          {account.value
            ? <>
                <p class="account">
                  {account.value.avatar && <img src={account.value.avatar} alt="" width={32} height={32} />}
                  <span>Signed in as <b>{account.value.name}</b>. Changes sync to your other devices.</span>
                </p>
                <p class="row-actions">
                  <button type="button" class="btn" onClick={() => void refreshLibrary()}>Refresh library</button>
                  <button type="button" class="btn ghost" onClick={() => void signOut()}>Sign out</button>
                </p>
              </>
            : <>
                <p class="row-actions"><button type="button" class="btn primary" onClick={signIn}>Sign in with Steam</button></p>
                <p class="hint">Imports your Steam library and syncs across devices. What you've done in this browser comes along.</p>
              </>}
        </section>

        {account.value && (
          <section class="detail-section">
            <h3>Sharing</h3>
            <ProfileSettings me={account.value} />
          </section>
        )}

        <section class="detail-section">
          <h3>Display</h3>
          <div class="setting">
            <span>Theme</span>
            <Radio<Theme> name="Theme" value={s.theme} onChange={theme => updateSettings({ theme })}
              options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} />
          </div>
          <div class="setting">
            <span>Sort and total by</span>
            <Radio<Measure> name="Length measure" value={s.measure} onChange={measure => updateSettings({ measure })}
              options={[["main_extra", "Main + Extras"], ["main", "Main story"]]} />
          </div>
          <label class="check">
            <input type="checkbox" checked={s.nowPlaying} onChange={e => updateSettings({ nowPlaying: e.currentTarget.checked })} />
            Now playing shelf: Playing games in a row above the grid
          </label>
        </section>

        {!account.value && (
          <section class="detail-section">
            <h3>Library</h3>
            <p class="row-actions">
              <FilePick label="Open library file" accept=".json,application/json" onFile={guard(text => {
                const r = mergeLibrary(parseLibrary(text));
                showToast(`${count(r.added, "game")} added, ${r.updated} updated`);
              })} />
            </p>
          </section>
        )}

        <section class="detail-section">
          <h3>Backup</h3>
          <p class="row-actions">
            <button type="button" class="btn" onClick={exportBackup}>Export backup</button>
            <FilePick label="Restore backup" accept=".json,application/json" onFile={guard(text => setBackup(parseExport(text)))} />
          </p>
          {backup && (
            <div class="callout">
              <p>Backup from {new Date(backup.exportedAt).toLocaleString()}: {count(backup.games.length, "game")},{" "}
                {backup.games.filter(g => g.status !== "backlog").length} with a status, {backup.games.filter(g => g.myKind).length} with your own length{backup.lists?.length ? `, ${count(backup.lists.length, "list")}` : ""}.</p>
              <p class="row-actions">
                <button type="button" class="btn primary" onClick={async () => {
                  await restoreBackup(backup, "merge"); setBackup(null); showToast("Backup merged");
                }}>Merge into this library</button>
                <button type="button" class="btn" onClick={async () => {
                  await restoreBackup(backup, "replace"); setBackup(null); showToast("Library replaced from backup");
                }}>Replace this library</button>
                <button type="button" class="btn ghost" onClick={() => setBackup(null)}>Cancel</button>
              </p>
            </div>
          )}
        </section>

        {error && <p class="error" role="alert">{error}</p>}

        {account.value
          ? <section class="detail-section">
              <h3>Delete account</h3>
              {confirmDelete
                ? <div class="callout">
                    <p>This deletes your account and everything synced to it: statuses, notes, your lengths and what you shared with the community. Your Steam account isn't affected. Export a backup first to keep your data.</p>
                    <p class="row-actions">
                      <button type="button" class="btn" onClick={exportBackup}>Export backup</button>
                      <button type="button" class="btn danger" onClick={() => void deleteAccount()}>Delete my account</button>
                      <button type="button" class="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                    </p>
                  </div>
                : <button type="button" class="btn risky" onClick={() => setConfirmDelete(true)}>Delete account…</button>}
            </section>
          : <section class="detail-section">
              <h3>Local data</h3>
              {confirmDelete
                ? <p class="row-actions">
                    <span>This removes your library, statuses and lengths from this browser. Export a backup first.</span>
                    <button type="button" class="btn danger" onClick={() => void deleteEverything()}>Delete everything</button>
                    <button type="button" class="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                  </p>
                : <button type="button" class="btn risky" onClick={() => setConfirmDelete(true)}>Delete local data…</button>}
            </section>}
      </div>
    </div>
  );
}
