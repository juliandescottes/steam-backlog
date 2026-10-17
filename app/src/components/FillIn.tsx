import { useEffect, useState } from "preact/hooks";
import { byId, fillInQueue } from "../store.ts";
import { playtime } from "../util.ts";
import { Art } from "./Art.tsx";
import { LengthEditor } from "./LengthEditor.tsx";

/** One game at a time until every queued game has a length or was skipped (SPEC §4). */
export function FillIn() {
  const [queue, setQueue] = useState(() => fillInQueue.value ?? []);
  const [total] = useState(queue.length);
  const [i, setI] = useState(0);
  const [skipped] = useState(() => new Set<number>());
  const [filled, setFilled] = useState(0);
  const close = () => (fillInQueue.value = null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const e = i < queue.length ? byId.value.get(queue[i]) : undefined;
  const next = () => setI(i + 1);
  const saved = () => { setFilled(filled + 1); next(); };
  // A skipped game comes back once at the end of the queue
  const skip = () => {
    const id = queue[i];
    if (!skipped.has(id)) { skipped.add(id); setQueue([...queue, id]); }
    next();
  };
  const stillSkipped = [...skipped].filter(id => { const x = byId.value.get(id); return x && x.len.hours == null && !x.len.endless; }).length;

  return (
    <div class="modal-backdrop">
      <div class="modal fill-in" role="dialog" aria-modal="true" aria-labelledby="fill-title">
        <div class="fill-top">
          <h2 id="fill-title">Fill in lengths</h2>
          <span class="count">{filled} / {total} filled</span>
          <button type="button" class="btn ghost" onClick={close} aria-label="Close">Esc ✕</button>
        </div>
        {e ? (
          <div class="fill-body" key={`${e.game.appid}-${i}`}>
            <div class={`cover fill-cover${e.game.portrait === false ? " wide" : ""}`}><Art game={e.game} eager /></div>
            <div class="fill-main">
              <h3>{e.game.name}</h3>
              <p class="sub">{e.game.playtimeMin ? `Played ${playtime(e.game.playtimeMin)} on Steam` : "Never launched"}
                {skipped.has(e.game.appid) && " · skipped once"}</p>
              <LengthEditor game={e.game} autoFocus refocusOnReturn onSaved={saved} onSkip={skip} />
              <p class="row-actions"><button type="button" class="btn ghost" onClick={skip}>Skip</button>
                <span class="hint">{queue.length - i - 1} more after this one</span></p>
            </div>
          </div>
        ) : (
          <div class="fill-done">
            <h3>{filled ? `${filled} length${filled === 1 ? "" : "s"} added` : "Nothing added"}</h3>
            {stillSkipped > 0 && <p class="sub">{stillSkipped} skipped. They stay in the Unknown band.</p>}
            <button type="button" class="btn primary" onClick={close} ref={el => el?.focus()}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
