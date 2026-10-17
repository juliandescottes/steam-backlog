import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Filter } from "@backlog/shared/filter";
import { activeView, applyView, deleteView, extra, saveView, views } from "../store.ts";
import { date } from "../util.ts";

/** Smart views as chips under the header (SPEC §6), plus saving the current filter as a new one. */
export function ViewTabs() {
  const active = activeView.value;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { if (naming) input.current?.focus(); }, [naming]);

  const save = () => {
    if (name.trim()) saveView(name.trim());
    setNaming(false);
    setName("");
  };

  return (
    <nav class="views" aria-label="Views">
      {views.value.map(v => (
        <span key={v.id} class={`view${active?.id === v.id ? " active" : ""}`}>
          <button type="button" aria-current={active?.id === v.id ? "true" : undefined} onClick={() => applyView(v)}>{v.name}</button>
          {!v.id.startsWith("builtin:") && active?.id === v.id && (
            <button type="button" class="remove" aria-label={`Delete view ${v.name}`} onClick={() => deleteView(v.id)}>✕</button>
          )}
        </span>
      ))}
      {!active && (naming
        ? <form class="view naming" onSubmit={e => { e.preventDefault(); save(); }}>
            <input ref={input} value={name} placeholder="View name" aria-label="View name" maxLength={40}
              onInput={e => setName(e.currentTarget.value)} onBlur={save}
              onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setName(""); setNaming(false); } }} />
          </form>
        : <button type="button" class="view save" onClick={() => setNaming(true)}>+ Save view</button>)}
    </nav>
  );
}

const YEAR = 365 * 24 * 60 * 60 * 1000;

/** Conditions the toolbar can't show: one removable pill each. */
function pills(f: Filter): [keys: (keyof Filter)[], label: string][] {
  const out: [(keyof Filter)[], string][] = [];
  if (f.minHours != null && f.maxHours != null) out.push([["minHours", "maxHours"], `${f.minHours} to ${f.maxHours} h`]);
  else if (f.maxHours != null) out.push([["maxHours"], `Under ${f.maxHours} h`]);
  else if (f.minHours != null) out.push([["minHours"], `${f.minHours} h and up`]);
  if (f.needsLength) out.push([["needsLength"], "Needs a length"]);
  const a = f.finishedAfter, b = f.finishedBefore;
  if (a != null && b != null && new Date(a).getMonth() === 0 && new Date(a).getDate() === 1 && Math.abs(b - a - YEAR) < 2 * 86_400_000) {
    out.push([["finishedAfter", "finishedBefore"], `Finished in ${new Date(a).getFullYear()}`]);
  } else {
    if (a != null) out.push([["finishedAfter"], `Finished since ${date(a)}`]);
    if (b != null) out.push([["finishedBefore"], `Finished before ${date(b)}`]);
  }
  if (f.addedAfter != null) out.push([["addedAfter"], `Added since ${date(f.addedAfter)}`]);
  if (f.addedBefore != null) out.push([["addedBefore"], `Added before ${date(f.addedBefore)}`]);
  return out;
}

export function ConditionPills() {
  const list = pills(extra.value);
  if (!list.length) return null;
  const remove = (keys: (keyof Filter)[]) => {
    const next = { ...extra.value };
    for (const k of keys) delete next[k];
    extra.value = next;
  };
  return (
    <div class="chips" role="group" aria-label="Other conditions">
      {list.map(([keys, label]) => (
        <button type="button" key={label} class="chip pill" onClick={() => remove(keys)} aria-label={`Remove condition: ${label}`}>{label} ✕</button>
      ))}
    </div>
  );
}
