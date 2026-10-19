import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { formatHours } from "@backlog/shared/bands";
import { SORT_LABEL, type Entry, type SortKey } from "@backlog/shared/filter";
import { normalizeName } from "@backlog/shared/names";
import { rank } from "@backlog/shared/rank";
import { STATUSES, STATUS_LABEL } from "@backlog/shared/types";
import { account, refreshLibrary, signIn } from "../account.ts";
import { LISTS_PATH, listPath, navigate } from "../route.ts";
import {
  applyView, clearSelection, currentList, entries, exportBackup, openId, paletteOpen, pickerFor, selectAll, selection, setStatus,
  settingsOpen, shortcutsOpen, sortedLists, sortKey, startFillIn, statuses, triageOpen, undo, updateSettings, views, type Theme,
} from "../store.ts";
import { isMac } from "../util.ts";

const MOD = isMac ? "⌘" : "Ctrl+";
const LIMIT = 10;

type Item =
  | { kind: "action"; label: string; key: string; keys?: string; run: () => void }
  | { kind: "game"; entry: Entry; key: string };

function actions(): Item[] {
  const sel = [...selection.value];
  const out: Omit<Extract<Item, { kind: "action" }>, "kind" | "key">[] = [];
  if (sel.length) {
    for (const s of STATUSES) out.push({ label: `Mark selection ${STATUS_LABEL[s]}`, run: () => { setStatus(sel, s); clearSelection(); } });
    out.push({ label: "Fill in lengths for the selection", run: () => { startFillIn(sel); clearSelection(); } });
    out.push({ label: "Add selection to list…", keys: "A", run: () => { pickerFor.value = sel; clearSelection(); } });
    out.push({ label: "Clear selection", keys: "Esc", run: clearSelection });
  }
  out.push(
    { label: "Fill in lengths", run: () => startFillIn() },
    { label: "Review finished games", run: () => (triageOpen.value = true) },
    { label: "Select all shown", keys: `${MOD}A`, run: selectAll },
    { label: "Undo", keys: `${MOD}Z`, run: undo },
  );
  for (const v of views.value) out.push({ label: `View: ${v.name}`, run: () => { navigate("/"); applyView(v); } });
  for (const l of sortedLists.value) out.push({ label: `List: ${l.title}`, run: () => navigate(listPath(l)) });
  if (currentList.value) out.push({ label: "Back to backlog", run: () => navigate("/") });
  out.push({ label: "Lists", run: () => navigate(LISTS_PATH) });
  out.push({ label: "Show all statuses", run: () => (statuses.value = STATUSES) });
  for (const [k, label] of Object.entries(SORT_LABEL)) out.push({ label: `Sort by ${label.toLowerCase()}`, run: () => (sortKey.value = k as SortKey) });
  if (account.value) out.push({ label: "Refresh library", run: () => void refreshLibrary() });
  else out.push({ label: "Sign in with Steam", run: signIn });
  out.push({ label: "Export backup", run: exportBackup });
  for (const t of ["dark", "light", "system"] as Theme[]) out.push({ label: `Theme: ${t}`, run: () => updateSettings({ theme: t }) });
  out.push(
    { label: "Settings", run: () => (settingsOpen.value = true) },
    { label: "Keyboard shortcuts", keys: "?", run: () => (shortcutsOpen.value = true) },
  );
  return out.map(a => ({ ...a, kind: "action", key: normalizeName(a.label) }));
}

/** Ctrl+K: jump to a game or run an action (SPEC §6). Prefix matches rank first, then word starts, then the rest. */
export function Palette() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => input.current?.focus(), []);

  const acts = actions();
  const items: Item[] = query.trim()
    ? rank(query, [...acts, ...entries.value.map((e): Item => ({ kind: "game", entry: e, key: e.key }))], i => i.key, LIMIT)
    : acts.slice(0, LIMIT);
  const at = Math.min(active, items.length - 1);

  const close = () => (paletteOpen.value = false);
  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.kind === "action") item.run();
    else openId.value = item.entry.game.appid;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = items.length;
      if (n) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[at]);
    }
  };

  return (
    <div class="modal-backdrop" onClick={ev => ev.target === ev.currentTarget && close()}>
      <div class="modal palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input ref={input} type="text" placeholder="Jump to a game or run an action" aria-label="Search games and actions"
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items.length ? `palette-${at}` : undefined}
          value={query} onInput={e => { setQuery(e.currentTarget.value); setActive(0); }} onKeyDown={onKey} />
        <ul id="palette-list" role="listbox" aria-label="Results">
          {items.map((item, i) => (
            <li key={item.kind === "game" ? item.entry.game.appid : item.label} id={`palette-${i}`} role="option" aria-selected={i === at}
              class={i === at ? "active" : ""} onMouseMove={() => i !== at && setActive(i)} onClick={() => choose(item)}>
              {item.kind === "action"
                ? <><span>{item.label}</span>{item.keys && <kbd>{item.keys}</kbd>}</>
                : <><span>{item.entry.game.name}</span>
                    <span class="palette-meta">
                      {item.entry.game.status !== "backlog" && `${STATUS_LABEL[item.entry.game.status]} · `}
                      {item.entry.len.endless ? "No ending" : item.entry.len.hours == null ? "No length" : formatHours(item.entry.len.hours, item.entry.len.approx)}
                    </span></>}
            </li>
          ))}
          {!items.length && <li class="palette-empty">Nothing matches</li>}
        </ul>
      </div>
    </div>
  );
}
