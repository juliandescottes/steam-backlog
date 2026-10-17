import { memo } from "preact/compat";
import { bandOf, formatHours } from "@backlog/shared/bands";
import type { Entry } from "@backlog/shared/filter";
import { STATUS_LABEL, type Status } from "@backlog/shared/types";
import { editingId, openId, setStatus } from "../store.ts";
import { playtime } from "../util.ts";
import { Art } from "./Art.tsx";
import { LengthEditor } from "./LengthEditor.tsx";

const QUICK: { status: Status; label: string; key: string }[] = [
  { status: "playing", label: "Playing", key: "P" },
  { status: "finished", label: "Finished", key: "F" },
  { status: "dropped", label: "Dropped", key: "D" },
];

/** Re-renders only when its entry object changes, which the store guarantees for unchanged games. */
export const Card = memo(function Card({ e, editing }: { e: Entry; editing: boolean }) {
  const { game: g, len } = e;
  const band = bandOf(len);
  const unknown = len.hours == null && !len.endless;

  return (
    <article class={`game status-${g.status}`} data-appid={g.appid} style={{ "--c": `var(${band.color})` }}>
      <div class="cover-wrap">
        <button type="button" class={`cover${g.portrait === false ? " wide" : ""}`} onClick={() => (openId.value = g.appid)}
          aria-label={`${g.name}: details`}>
          <Art game={g} />
        </button>
        {unknown
          ? <button type="button" class="hrs unknown" onClick={() => (editingId.value = editing ? null : g.appid)}
              aria-label={`Add a length for ${g.name}`} aria-expanded={editing}>?</button>
          : <span class="hrs">{len.endless ? "∞" : formatHours(len.hours, len.approx)}</span>}
        {g.status !== "backlog" && <span class="status-chip">{STATUS_LABEL[g.status]}</span>}
        <div class="quick" role="group" aria-label="Set status">
          {QUICK.map(q => (
            <button type="button" key={q.status} class={g.status === q.status ? "on" : ""} title={`${q.label} (${q.key})`}
              aria-label={g.status === q.status ? `Back to Backlog` : `Mark ${q.label}`}
              onClick={() => setStatus([g.appid], g.status === q.status ? "backlog" : q.status)}>{q.key}</button>
          ))}
        </div>
      </div>
      <div class="meta">
        <div class="name">{g.name}</div>
        {g.playtimeMin > 0 && <div class="sub">Played {playtime(g.playtimeMin)}</div>}
      </div>
      {editing && (
        <div class="popover" role="dialog" aria-label={`Length for ${g.name}`}>
          <LengthEditor game={g} autoFocus onSaved={() => (editingId.value = null)} onCancel={() => (editingId.value = null)} />
        </div>
      )}
    </article>
  );
});
