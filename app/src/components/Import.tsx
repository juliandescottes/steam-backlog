import { account, importing, retryImport, signOut } from "../account.ts";

/** First sign-in: the Steam library import, or what to do when Steam won't share it. */
export function Import() {
  const state = importing.value;
  return (
    <div class="wrap welcome">
      <header class="top">
        <div class="eyebrow">Backlog · {account.value?.name}</div>
        {state === "running" && <h1 class="importing" aria-live="polite">Fetching your <em>Steam</em> library…</h1>}
        {state === "private" && <h1>Steam won't share your <em>games</em> yet</h1>}
        {state === "failed" && <h1>Couldn't reach <em>Steam</em></h1>}
      </header>
      {state === "private" && (
        <div class="callout">
          <p>Your profile's game details are private, so Steam doesn't tell other sites which games you own. To make them public:</p>
          <ol>
            <li>Open your <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noreferrer">Steam privacy settings</a>.</li>
            <li>Set <b>Game details</b> to <b>Public</b>. Your profile itself has to be public too.</li>
            <li>Come back and retry. Steam can take a minute to apply the change.</li>
          </ol>
        </div>
      )}
      {state === "failed" && <p class="lede">Steam or this site didn't answer. Your data is safe; try again in a moment.</p>}
      {state !== "running" && (
        <p class="row-actions">
          <button type="button" class="btn primary" onClick={() => void retryImport()}>Retry</button>
          <button type="button" class="btn ghost" onClick={() => void signOut()}>Sign out</button>
        </p>
      )}
    </div>
  );
}
