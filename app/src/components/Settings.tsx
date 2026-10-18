import { useEffect, useRef, useState } from "preact/hooks";
import { parseExport, parseLibrary, type ExportFile } from "@backlog/shared/files";
import type { Measure } from "@backlog/shared/types";
import { profilePath } from "@backlog/shared/share";
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

function Radio<T extends string>({ name, value, options, onChange, describedBy }: {
  name: string; value: T; options: [T, string][]; onChange: (v: T) => void; describedBy?: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={name} aria-describedby={describedBy}>
      {options.map(([v, label]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

/** The public profile at /u/<profile id>: off by default. */
function ProfileSettings({ me }: { me: Me }) {
  const [error, setError] = useState<string | null>(null);
  const save = async (change: Parameters<typeof setProfile>[0]) => setError(await setProfile(change));
  return (
    <>
      <div class="option">
        <label class="check">
          <input type="checkbox" checked={me.profilePublic} aria-describedby="profile-hint" onChange={e => void save({ profilePublic: e.currentTarget.checked })} />
          Public profile
        </label>
        <p class="hint" id="profile-hint">
          Your Steam name and avatar, games finished and hours cleared, and your public lists.
          {me.profilePublic && me.profileId && <> <a href={profilePath(me.profileId)} onClick={e => { e.preventDefault(); settingsOpen.value = false; navigate(profilePath(me.profileId)); }}>View your profile →</a></>}
        </p>
        {error && <p class="error" role="alert">{error}</p>}
      </div>
      <div class="option">
        <label class="check">
          <input type="checkbox" checked={me.showBacklog} disabled={!me.profilePublic} aria-describedby="backlog-hint"
            onChange={e => void save({ showBacklog: e.currentTarget.checked })} />
          Show my whole backlog
        </label>
        <p class="hint" id="backlog-hint">Every game with its length and status, never notes or playtime.</p>
      </div>
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
                <div class="option indented">
                  <p class="row-actions"><button type="button" class="btn" onClick={() => void refreshLibrary()} aria-describedby="refresh-hint">Refresh library</button></p>
                  <p class="hint" id="refresh-hint">Adds games you bought since and updates playtimes from Steam. Happens once a day on its own.</p>
                </div>
                <div class="option indented">
                  <p class="row-actions"><button type="button" class="btn" onClick={() => void signOut()} aria-describedby="sign-out-hint">Sign out</button></p>
                  <p class="hint" id="sign-out-hint">Removes your games from this browser. They stay in your account.</p>
                </div>
              </>
            : <div class="option indented">
                <p class="row-actions"><button type="button" class="btn primary" onClick={signIn} aria-describedby="sign-in-hint">Sign in with Steam</button></p>
                <p class="hint" id="sign-in-hint">Imports your Steam library and syncs across devices. What you've done in this browser comes along.</p>
              </div>}
        </section>

        {account.value && (
          <section class="detail-section">
            <h3>Sharing</h3>
            <ProfileSettings me={account.value} />
          </section>
        )}

        <section class="detail-section">
          <h3>Display</h3>
          <div class="option indented">
            <div class="setting">
              <span>Theme</span>
              <Radio<Theme> name="Theme" value={s.theme} onChange={theme => updateSettings({ theme })} describedBy="theme-hint"
                options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} />
            </div>
            <p class="hint" id="theme-hint">System follows your device's light or dark mode.</p>
          </div>
          <div class="option indented">
            <div class="setting">
              <span>Sort and total by</span>
              <Radio<Measure> name="Length measure" value={s.measure} onChange={measure => updateSettings({ measure })} describedBy="measure-hint"
                options={[["main_extra", "Main + Extras"], ["main", "Main story"]]} />
            </div>
            <p class="hint" id="measure-hint">Which length orders games and adds up to your hours. Main + Extras is the main story plus the side content most players do.</p>
          </div>
          <div class="option">
            <label class="check">
              <input type="checkbox" checked={s.nowPlaying} aria-describedby="now-playing-hint" onChange={e => updateSettings({ nowPlaying: e.currentTarget.checked })} />
              Now playing shelf
            </label>
            <p class="hint" id="now-playing-hint">Your Playing games in a row above the grid, whatever the view.</p>
          </div>
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
          <div class="option indented">
            <p class="row-actions"><button type="button" class="btn" onClick={exportBackup} aria-describedby="export-hint">Export backup</button></p>
            <p class="hint" id="export-hint">A file with your statuses, dates, notes, lengths, views and lists.</p>
          </div>
          <div class="option indented">
            <p class="row-actions"><FilePick label="Restore backup" accept=".json,application/json" onFile={guard(text => setBackup(parseExport(text)))} /></p>
            <p class="hint">Shows what the file holds, then merges it into this library or replaces it.</p>
          </div>
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
                    <p>This deletes your account and everything synced to it: statuses, notes, your lengths, lists and public profile. Your Steam account isn't affected. Export a backup first to keep your data.</p>
                    <p class="row-actions">
                      <button type="button" class="btn" onClick={exportBackup}>Export backup</button>
                      <button type="button" class="btn danger" onClick={() => void deleteAccount()}>Delete my account</button>
                      <button type="button" class="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                    </p>
                  </div>
                : <div class="option indented">
                    <p class="row-actions"><button type="button" class="btn risky" onClick={() => setConfirmDelete(true)} aria-describedby="delete-hint">Delete account…</button></p>
                    <p class="hint" id="delete-hint">Removes your account and everything synced to it. Asks first.</p>
                  </div>}
            </section>
          : <section class="detail-section">
              <h3>Local data</h3>
              {confirmDelete
                ? <p class="row-actions">
                    <span>This removes your library, statuses and lengths from this browser. Export a backup first.</span>
                    <button type="button" class="btn danger" onClick={() => void deleteEverything()}>Delete everything</button>
                    <button type="button" class="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                  </p>
                : <div class="option indented">
                    <p class="row-actions"><button type="button" class="btn risky" onClick={() => setConfirmDelete(true)} aria-describedby="delete-hint">Delete local data…</button></p>
                    <p class="hint" id="delete-hint">Removes your library, statuses and lengths from this browser. Asks first.</p>
                  </div>}
            </section>}
      </div>
    </div>
  );
}
