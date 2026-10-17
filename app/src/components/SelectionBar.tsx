import { STATUSES, STATUS_LABEL } from "@backlog/shared/types";
import { clearSelection, selectAll, selection, setStatus, startFillIn, visible } from "../store.ts";
import { count } from "../util.ts";

/** Actions on the bulk selection; one action is one undo. */
export function SelectionBar() {
  const ids = [...selection.value];
  if (!ids.length) return null;
  const act = (fn: () => void) => () => { fn(); clearSelection(); };
  return (
    <div class="selection-bar" role="toolbar" aria-label="Selected games">
      <b>{count(ids.length, "game")} selected</b>
      {STATUSES.map(s => (
        <button type="button" key={s} class="btn" onClick={act(() => setStatus(ids, s))}>{STATUS_LABEL[s]}</button>
      ))}
      <button type="button" class="btn" onClick={act(() => startFillIn(ids))}>Fill in lengths</button>
      {ids.length < visible.value.length && (
        <button type="button" class="btn ghost" onClick={selectAll} title="Ctrl+A">Select all</button>
      )}
      <button type="button" class="btn ghost" onClick={clearSelection} aria-label="Clear selection" title="Esc">✕</button>
    </div>
  );
}
