import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { normalizeName } from "@backlog/shared/names";
import { rank } from "@backlog/shared/rank";
import type { List } from "@backlog/shared/lists";
import { listPath, navigate, route } from "../route.ts";
import {
  createList, deleteList, listEntries, listItems, listsOpen, pickerFor, settingsOpen, sortedLists, toggleInList, updateList,
} from "../store.ts";
import { count } from "../util.ts";

/** A link that opens in the app, or in a new tab with a modifier key. */
function Link({ href, onNavigate, ...props }: { href: string; onNavigate?: () => void; class?: string; children: any; "aria-current"?: "page" }) {
  return (
    <a href={href} {...props} onClick={e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      onNavigate?.();
      navigate(href);
    }} />
  );
}

const size = (l: List) => (l.kind === "manual" ? listItems.value.get(l.id)?.size ?? 0 : listEntries(l).length);

/** The user's lists (SPEC §7): a drawer from the left, on every screen size. */
export function ListsDrawer() {
  const [name, setName] = useState("");
  const [fromView, setFromView] = useState(false);
  const close = () => (listsOpen.value = false);
  const input = useRef<HTMLInputElement>(null);
  // Not on touch screens, where it would bring up the keyboard over the lists
  useLayoutEffect(() => { if (matchMedia("(pointer: fine)").matches) input.current?.focus(); }, []);
  const r = route.value;
  const onLibrary = r.page === "library";

  const create = (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const l = createList(name.trim(), onLibrary && fromView ? "filter" : "manual");
    close();
    navigate(listPath(l.id));
  };

  return (
    <div class="sheet-backdrop" onClick={ev => ev.target === ev.currentTarget && close()}>
      <div class="sheet drawer" role="dialog" aria-modal="true" aria-labelledby="lists-title">
        <button type="button" class="btn ghost close" onClick={close} aria-label="Close">✕</button>
        <h2 id="lists-title">Lists</h2>
        <nav aria-label="Your lists">
          <ul class="list-nav">
            <li><Link href="/" onNavigate={close} aria-current={onLibrary ? "page" : undefined}>Backlog <span>all games</span></Link></li>
            {sortedLists.value.map(l => (
              <li key={l.id}>
                <Link href={listPath(l.id)} onNavigate={close} aria-current={r.page === "list" && r.id === l.id ? "page" : undefined}>
                  {l.title} <span>{l.kind === "filter" ? "auto · " : ""}{size(l)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form class="new-list" onSubmit={create}>
          <label for="new-list">New list</label>
          <div class="row-actions">
            <input ref={input} id="new-list" value={name} maxLength={80} placeholder="Up next, Best short games…" onInput={e => setName(e.currentTarget.value)} />
            <button type="submit" class="btn primary" disabled={!name.trim()}>Create</button>
          </div>
          {onLibrary && (
            <label class="check">
              <input type="checkbox" checked={fromView} onChange={e => setFromView(e.currentTarget.checked)} />
              Games of the current view, updated as your library changes
            </label>
          )}
          {!sortedLists.value.length && <p class="hint">Add games from a cover (the + button or <kbd>A</kbd>), the detail panel, or a selection.</p>}
        </form>
      </div>
    </div>
  );
}

type Choice = { kind: "list"; list: List; key: string } | { kind: "new"; title: string; key: string };

/** "Add to list" for one game or a selection: pick a list, or type a new name. Picking a list the games are all in takes them out. */
export function ListPicker() {
  const ids = pickerFor.value!;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => input.current?.focus(), []);

  const manual = sortedLists.value.filter(l => l.kind === "manual");
  const q = query.trim();
  const found: Choice[] = rank(q, manual.map((list): Choice => ({ kind: "list", list, key: normalizeName(list.title) })), p => p.key, 50);
  const items: Choice[] = q && !manual.some(l => normalizeName(l.title) === normalizeName(q)) ? [...found, { kind: "new", title: q, key: "" }] : found;
  const at = Math.min(active, items.length - 1);
  const items_ = listItems.value;
  const inAll = (l: List) => ids.every(id => items_.get(l.id)?.has(id));

  const close = () => (pickerFor.value = null);
  const choose = (p: Choice | undefined) => {
    if (!p) return;
    close();
    if (p.kind === "list") toggleInList(p.list.id, ids);
    else createList(p.title, "manual", ids);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[at]);
    }
  };

  return (
    <div class="modal-backdrop" onClick={ev => ev.target === ev.currentTarget && close()}>
      <div class="modal palette" role="dialog" aria-modal="true" aria-label="Add to list">
        <input ref={input} type="text" placeholder={ids.length === 1 ? "Add to list: find or name a new one" : `Add ${ids.length} games to list`}
          aria-label="Find or create a list" role="combobox" aria-expanded="true" aria-controls="picker-list"
          aria-activedescendant={items.length ? `picker-${at}` : undefined}
          value={query} onInput={e => { setQuery(e.currentTarget.value); setActive(0); }} onKeyDown={onKey} />
        <ul id="picker-list" role="listbox" aria-label="Lists">
          {items.map((p, i) => (
            <li key={p.kind === "list" ? p.list.id : "new"} id={`picker-${i}`} role="option" aria-selected={i === at}
              class={i === at ? "active" : ""} onMouseMove={() => i !== at && setActive(i)} onClick={() => choose(p)}>
              {p.kind === "list"
                ? <><span>{p.list.title}</span><span class="palette-meta">{inAll(p.list) ? "✓ in it · remove" : count(items_.get(p.list.id)?.size ?? 0, "game")}</span></>
                : <><span>New list “{p.title}”</span><span class="palette-meta">Enter</span></>}
            </li>
          ))}
          {!items.length && <li class="palette-empty">No lists yet. Type a name to create one.</li>}
        </ul>
      </div>
    </div>
  );
}

/** Top of a list page: title, description, totals, and the owner's controls. */
export function ListHeader({ list: l }: { list: List }) {
  const [editing, setEditing] = useState(false);
  const all = listEntries(l);
  const hours = all.reduce((s, e) => s + (e.len.hours ?? 0), 0);
  const finished = all.filter(e => e.game.status === "finished").length;

  return (
    <header class="top">
      <div class="eyebrow-row">
        <Link href="/" class="eyebrow back">← Backlog</Link>
        <div class="row-actions">
          <button type="button" class="btn ghost" onClick={() => (listsOpen.value = true)}>Lists</button>
          <button type="button" class="btn ghost" onClick={() => (settingsOpen.value = true)}>Settings</button>
        </div>
      </div>
      {editing
        ? <ListForm list={l} onDone={() => setEditing(false)} />
        : <>
            <h1>{l.title}</h1>
            {l.description && <p class="lede">{l.description}</p>}
          </>}
      <p class="list-meta">
        {count(all.length, "game")} · {count(hours, "hour")}{finished > 0 && ` · ${finished} finished`}
        {l.kind === "filter" && <span> · updates with your library</span>}
      </p>
      {!editing && (
        <p class="row-actions">
          <button type="button" class="btn" onClick={() => setEditing(true)}>Rename</button>
          <button type="button" class="btn ghost" onClick={() => deleteList(l.id)}>Delete list</button>
        </p>
      )}
    </header>
  );
}

function ListForm({ list: l, onDone }: { list: List; onDone: () => void }) {
  const [title, setTitle] = useState(l.title);
  const [description, setDescription] = useState(l.description);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => input.current?.select(), []);
  const save = (e: Event) => {
    e.preventDefault();
    const change: Partial<Pick<List, "title" | "description">> = {};
    if (title.trim() && title.trim() !== l.title) change.title = title.trim();
    if (description.trim() !== l.description) change.description = description.trim();
    if (Object.keys(change).length) updateList(l.id, change);
    onDone();
  };
  return (
    <form class="list-form" onSubmit={save} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onDone(); } }}>
      <input ref={input} value={title} maxLength={80} aria-label="List name" onInput={e => setTitle(e.currentTarget.value)} />
      <textarea rows={2} value={description} maxLength={1000} placeholder="Description (optional)" aria-label="Description"
        onInput={e => setDescription(e.currentTarget.value)} />
      <p class="row-actions">
        <button type="submit" class="btn primary">Save</button>
        <button type="button" class="btn ghost" onClick={onDone}>Cancel</button>
      </p>
    </form>
  );
}

/** Shown for /l/<id> when there's no such list (deleted, or from another browser before it synced). */
export function MissingList() {
  return (
    <div class="wrap">
      <header class="top">
        <h1>List not found</h1>
        <p class="lede">It may have been deleted. <Link href="/" class="link">Back to your backlog</Link></p>
      </header>
    </div>
  );
}
