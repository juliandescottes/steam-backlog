import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { normalizeName } from "@backlog/shared/names";
import { rank } from "@backlog/shared/rank";
import type { List } from "@backlog/shared/lists";
import { sharePath } from "@backlog/shared/share";
import { account, signIn } from "../account.ts";
import { LISTS_PATH, listPath, navigate, route } from "../route.ts";
import {
  activeView, createList, currentList, deleteList, listEntries, listItems, pickerFor, setListVisibility, settingsOpen, showToast, sortedLists,
  toggleInList, updateList,
} from "../store.ts";
import { count } from "../util.ts";
import { MiniCovers } from "./MiniCovers.tsx";

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

/** The top of the user's own pages: the two of them, Backlog and Lists, on the left; Settings on the right. */
export function TopNav() {
  const p = route.value.page;
  const inLists = p === "lists" || currentList.value != null;
  return (
    <div class="eyebrow-row">
      <nav class="top-nav" aria-label="Pages">
        <Link href="/" class={`eyebrow${p === "library" ? " active" : ""}`} aria-current={p === "library" ? "page" : undefined}>Backlog</Link>
        <Link href={LISTS_PATH} class={`eyebrow${inLists ? " active" : ""}`} aria-current={p === "lists" ? "page" : undefined}>Lists</Link>
      </nav>
      <button type="button" class="btn ghost" onClick={() => (settingsOpen.value = true)}>Settings</button>
    </div>
  );
}

/** The user's lists (LIST-1): one card each, with a field to create one. */
export function ListsPage() {
  const all = sortedLists.value;
  return (
    <div class="wrap">
      <header class="top">
        <TopNav />
        <h1>{all.length ? count(all.length, "list") : "Lists"}</h1>
        <p class="lede">Hand-picked games in your own order, or a view of your library that keeps itself up to date. Share any of them with a link.</p>
      </header>
      <NewList />
      {all.length > 0
        ? <main class="profile-lists">{all.map(l => <ListCard key={l.id} list={l} />)}</main>
        : <p class="hint">Add games from a cover (the + button or <kbd>A</kbd>), the detail panel, or a selection.</p>}
    </div>
  );
}

function ListCard({ list: l }: { list: List }) {
  const games = listEntries(l);
  const hours = games.reduce((s, e) => s + (e.len.hours ?? 0), 0);
  return (
    <Link href={listPath(l)} class="profile-list">
      <MiniCovers covers={games.slice(0, 4).map(e => e.game.appid)} />
      <span class="profile-list-text">
        <b>{l.title}</b>
        <span class="list-meta">
          {count(games.length, "game")} · {count(hours, "hour")}{l.kind === "filter" ? " · auto" : ""}{l.visibility !== "private" ? " · shared" : ""}
        </span>
        {l.description && <span class="hint">{l.description}</span>}
      </span>
    </Link>
  );
}

/** A name, and for a list that follows the library, the Backlog's current view as it is now. */
function NewList() {
  const [name, setName] = useState("");
  const [fromView, setFromView] = useState(false);
  const view = activeView.value;
  const create = (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    navigate(listPath(createList(name.trim(), fromView ? "filter" : "manual")));
  };
  return (
    <form class="new-list" onSubmit={create}>
      <label for="new-list">New list</label>
      <div class="row-actions">
        <input id="new-list" value={name} maxLength={80} placeholder="Up next, Best short games…" onInput={e => setName(e.currentTarget.value)} />
        <button type="submit" class="btn primary" disabled={!name.trim()}>Create</button>
      </div>
      <label class="check">
        <input type="checkbox" checked={fromView} onChange={e => setFromView(e.currentTarget.checked)} />
        From the Backlog's current view{view ? ` (${view.name})` : ""}, updated as your library changes
      </label>
    </form>
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

const Pen = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="M10.5 2.5l3 3L5 14H2v-3z" /><path d="M9 4l3 3" />
  </svg>
);

/** Text with a pen next to it that turns into a field of the same size: Enter or leaving it saves, Escape cancels. */
function InPlace({ tag: Tag, class: cls, value, label, placeholder, maxLength, multiline, onSave }: {
  tag: "h1" | "p"; class?: string; value: string; label: string; placeholder?: string; maxLength: number; multiline?: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const closed = useRef(false);
  // Whole lines of the text's own line height: scrollHeight alone runs taller than a tight heading
  const fit = (f: HTMLTextAreaElement) => {
    f.style.height = "auto";
    const line = parseFloat(getComputedStyle(f).lineHeight);
    f.style.height = line ? `${Math.max(1, Math.round(f.scrollHeight / line)) * line}px` : `${f.scrollHeight}px`;
  };
  useLayoutEffect(() => {
    const f = field.current;
    if (!f) return;
    fit(f);
    f.focus();
    f.select();
  }, [draft !== null]);
  const close = (save: boolean) => {
    if (closed.current) return; // blur follows Enter and Escape
    closed.current = true;
    if (save && draft !== null && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
  };
  const open = () => { closed.current = false; setDraft(value); };

  const classes = [cls, "in-place"].filter(Boolean).join(" ");
  if (draft !== null) {
    return (
      <Tag class={`${classes} editing`}>
        <textarea ref={field} rows={1} value={draft} maxLength={maxLength} aria-label={label} placeholder={placeholder}
          onInput={e => { setDraft(e.currentTarget.value); fit(e.currentTarget); }}
          onKeyDown={e => {
            if (e.key === "Enter" && !(multiline && e.shiftKey)) { e.preventDefault(); close(true); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
          }}
          onBlur={() => close(true)} />
      </Tag>
    );
  }
  return (
    <Tag class={classes}>
      {value || <button type="button" class="in-place-empty" onClick={open}>{placeholder}</button>}
      <button type="button" class="pen" aria-label={`Edit ${label.toLowerCase()}`} title={`Edit ${label.toLowerCase()}`} onClick={open}><Pen /></button>
    </Tag>
  );
}

/** Top of a list page: title and description edited in place, totals, sharing. */
export function ListHeader({ list: l }: { list: List }) {
  const all = listEntries(l);
  const hours = all.reduce((s, e) => s + (e.len.hours ?? 0), 0);
  const finished = all.filter(e => e.game.status === "finished").length;

  return (
    <header class="top">
      <TopNav />
      <InPlace tag="h1" class="list-title" value={l.title} label="List name" maxLength={80} onSave={title => title && updateList(l.id, { title })} />
      <InPlace tag="p" class="lede" value={l.description} label="Description" placeholder="Add a description" maxLength={1000} multiline
        onSave={description => updateList(l.id, { description })} />
      <p class="list-meta">
        {count(all.length, "game")} · {count(hours, "hour")}{finished > 0 && ` · ${finished} finished`}
        {l.kind === "filter" && <span> · updates with your library</span>}
      </p>
      <Sharing list={l} />
      <div class="action">
        <button type="button" class="btn" onClick={() => deleteList(l.id)} aria-describedby="delete-list-hint">Delete list</button>
        <p class="hint" id="delete-list-hint">Removes the list, not its games. You can undo it right after.</p>
      </div>
    </header>
  );
}

/**
 * Always shown on the owner's list page: its visibility, Private or Public (anyone with the link).
 * Sharing needs an account: the server serves the page. Viewers see the owner's Steam name.
 */
function Sharing({ list: l }: { list: List }) {
  const me = account.value;
  const shared = !!me && l.visibility !== "private";
  const url = `${location.origin}${sharePath(l.shareId)}`;
  return (
    <section class="share" aria-label="Sharing">
      <div class="action">
        <div class="segmented" role="radiogroup" aria-label="Visibility" aria-describedby="visibility-hint">
          <button type="button" role="radio" aria-checked={!shared} onClick={() => setListVisibility(l.id, "private")}>Private</button>
          <button type="button" role="radio" aria-checked={shared} disabled={!me} onClick={() => setListVisibility(l.id, "link")}>Public</button>
        </div>
        <p class="hint" id="visibility-hint">
          {shared ? <>This list is <b>public</b>: it shows up on your profile and anyone with the link can see it.</> : <>This list is <b>private</b>: only you can see it.</>}
          {!me && <> Making it public needs an account. <button type="button" class="link" onClick={signIn}>Sign in with Steam</button></>}
        </p>
      </div>
      {shared && (
        <p class="share-link">
          <a href={url} target="_blank" rel="noopener">{url.replace(/^https?:\/\//, "")}</a>
          <button type="button" class="btn" onClick={() => navigator.clipboard.writeText(url).then(() => showToast("Link copied"), () => showToast("Couldn't copy the link"))}>
            Copy link
          </button>
        </p>
      )}
    </section>
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
