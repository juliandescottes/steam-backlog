import { memo } from "preact/compat";
import { bandOf, formatHours } from "@backlog/shared/bands";
import type { Entry } from "@backlog/shared/filter";
import { STATUS_LABEL, type Status } from "@backlog/shared/types";
import { approxReason } from "../lengthText.ts";
import { editingId, openId, pickerFor, selection, setStatus, settings, toggleSelected } from "../store.ts";
import { playtime } from "../util.ts";
import { Art } from "./Art.tsx";
import { LengthEditor } from "./LengthEditor.tsx";

const QUICK: { status: Status; label: string; key: string }[] = [
  { status: "playing", label: "Playing", key: "P" },
  { status: "finished", label: "Finished", key: "F" },
  { status: "dropped", label: "Dropped", key: "D" },
];

/** Re-renders only when its entry object changes, which the store guarantees for unchanged games. */
type Props = { e: Entry; editing: boolean; selected: boolean; draggable?: boolean; drop?: "before" | "after" | null };

export const Card = memo(function Card({ e, editing, selected, draggable = false, drop = null }: Props) {
  const { game: g, len } = e;
  const band = bandOf(len);
  const unknown = len.hours == null && !len.endless;

  return (
    <article class={`game status-${g.status}${selected ? " selected" : ""}${drop ? ` drop-${drop}` : ""}`} data-appid={g.appid}
      style={{ "--c": `var(${band.color})` }} draggable={draggable || undefined}>
      <div class="cover-wrap">
        {/* While selecting, a click on the cover selects instead of opening details */}
        <button type="button" class={`cover${g.portrait === false ? " wide" : ""}`}
          onClick={ev => (selection.peek().size ? toggleSelected(g.appid, ev.shiftKey) : (openId.value = g.appid))}
          aria-label={`${g.name}: details`}>
          <Art game={g} />
        </button>
        <button type="button" class="select" role="checkbox" aria-checked={selected} aria-label={`Select ${g.name}`} title="Select (X)"
          onClick={ev => toggleSelected(g.appid, ev.shiftKey)}>✓</button>
        {unknown
          ? <button type="button" class="hrs unknown" onClick={() => (editingId.value = editing ? null : g.appid)}
              aria-label={`Add a length for ${g.name}`} aria-expanded={editing}>?</button>
          : <span class={`hrs${len.approx ? " approx" : ""}`} title={len.endless ? "No ending" : approxReason(e, settings.peek().measure) ?? undefined}>
              {len.endless ? "∞" : formatHours(len.hours)}</span>}
        {g.status !== "backlog" && <span class="status-chip">{STATUS_LABEL[g.status]}</span>}
        <div class="quick" role="group" aria-label="Quick actions">
          {QUICK.map(q => (
            <button type="button" key={q.status} class={g.status === q.status ? "on" : ""} title={`${q.label} (${q.key})`}
              aria-label={g.status === q.status ? `Back to Backlog` : `Mark ${q.label}`}
              onClick={() => setStatus([g.appid], g.status === q.status ? "backlog" : q.status)}>{q.key}</button>
          ))}
          <button type="button" title="Add to list (A)" aria-label={`Add ${g.name} to a list`} onClick={() => (pickerFor.value = [g.appid])}>+</button>
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
