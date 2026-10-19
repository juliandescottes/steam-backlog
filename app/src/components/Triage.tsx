import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { formatHours } from "@backlog/shared/bands";
import { answerTriage, playedThrough, triageCandidates, triageOpen } from "../store.ts";
import { count, portraitUrl } from "../util.ts";

/** Offer to finish Backlog games played past 80% of their length, while any is unanswered (ONB-5). */
export function TriageOffer() {
  const list = triageCandidates.value;
  if (!list.length) return null;
  const names = list.slice(0, 2).map(e => e.game.name);
  const more = list.length - names.length;
  const ids = list.map(e => e.game.appid);
  return (
    <aside class="triage" aria-label="Finished games">
      <p>
        You've played <b>{count(list.length, "game")}</b> for at least 80% of {list.length === 1 ? "its" : "their"} length
        {" "}({names.join(", ")}{more > 0 && ` and ${more} more`}). Mark {list.length === 1 ? "it" : "them"} Finished?
      </p>
      <p class="row-actions">
        <button type="button" class="btn primary" onClick={() => answerTriage(ids, [])}>Mark Finished</button>
        <button type="button" class="btn" onClick={() => (triageOpen.value = true)}>Review…</button>
        <button type="button" class="btn ghost" onClick={() => answerTriage([], ids)}>No thanks</button>
      </p>
    </aside>
  );
}

/**
 * Every Backlog game played past 80% of its length, to pick which to finish (ONB-10). Unanswered ones start
 * checked, declined ones unchecked; the list stays as it was when opened.
 */
export function TriageReview() {
  const [list] = useState(() => [...playedThrough.value].sort((a, b) => a.game.name.localeCompare(b.game.name)));
  const [checked, setChecked] = useState(() => new Set(list.filter(e => !e.game.triageDeclined).map(e => e.game.appid)));
  const first = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const close = () => (triageOpen.value = false);
  const toggle = (id: number) => {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  };
  const save = () => {
    const ids = list.map(e => e.game.appid);
    answerTriage(ids.filter(id => checked.has(id)), ids.filter(id => !checked.has(id)));
    close();
  };

  return (
    <div class="modal-backdrop" onClick={ev => ev.target === ev.currentTarget && close()}>
      <div class="modal triage-review" role="dialog" aria-modal="true" aria-labelledby="triage-title">
        <div class="fill-top">
          <h2 id="triage-title">Finished games</h2>
          <button type="button" class="btn ghost" onClick={close} aria-label="Close">Esc ✕</button>
        </div>
        {list.length ? <>
          <p class="hint">Backlog games you've played for at least 80% of their length. Unchecked ones stay in the Backlog and aren't suggested again.</p>
          <ul class="triage-list">
            {list.map(({ game: g, len }) => (
              <li key={g.appid}>
                <label class="check">
                  <input type="checkbox" checked={checked.has(g.appid)} onChange={() => toggle(g.appid)} />
                  <span class="thumb"><img src={portraitUrl(g.appid)} alt="" loading="lazy" onError={ev => ev.currentTarget.remove()} /></span>
                  <span class="text">
                    <span class="name">{g.name}</span>
                    <span class="meta">Played {formatHours(g.playtimeMin / 60)} of {formatHours(len.hours)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p class="row-actions">
            <button ref={first} type="button" class="btn primary" onClick={save}>
              {checked.size ? `Mark ${count(checked.size, "game")} Finished` : "Keep all in Backlog"}
            </button>
            <button type="button" class="btn ghost" onClick={close}>Cancel</button>
          </p>
        </> : <>
          <p class="hint">No Backlog game has been played for 80% of its length.</p>
          <p class="row-actions"><button ref={first} type="button" class="btn" onClick={close}>Close</button></p>
        </>}
      </div>
    </div>
  );
}
