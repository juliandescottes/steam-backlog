import { STATUSES, STATUS_LABEL } from "@backlog/shared/types";
import { clearSelection, currentList, pickerFor, removeFromList, selectAll, selection, setStatus, startFillIn, visible } from "../store.ts";

/** Actions on the bulk selection; one action is one undo. */
export function SelectionBar() {
  const ids = [...selection.value];
  if (!ids.length) return null;
  const act = (fn: () => void) => () => { fn(); clearSelection(); };
  const list = currentList.value;
  return (
    <div class="selection-bar" role="toolbar" aria-label="Selected games"><div class="selection-inner">
      <span class="sel-count"><b>{ids.length}</b> {ids.length === 1 ? "game" : "games"} selected</span>
      {STATUSES.map(s => (
        <button type="button" key={s} class="btn" onClick={act(() => setStatus(ids, s))}>{STATUS_LABEL[s]}</button>
      ))}
      <button type="button" class="btn" onClick={act(() => startFillIn(ids))}>Fill in lengths</button>
      <button type="button" class="btn" onClick={act(() => (pickerFor.value = ids))} title="A">Add to list…</button>
      {list?.kind === "manual" && <button type="button" class="btn" onClick={act(() => removeFromList(list.id, ids))}>Remove from list</button>}
      {ids.length < visible.value.length && (
        <button type="button" class="btn ghost" onClick={selectAll} title="Ctrl+A">Select all</button>
      )}
      <button type="button" class="btn ghost" onClick={clearSelection} aria-label="Clear selection" title="Esc">✕</button>
    </div></div>
  );
}
