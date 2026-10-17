import { batch, computed, effect, signal } from "@preact/signals";
import { BANDS, bandOf, formatHours, type Band } from "@backlog/shared/bands";
import { makeExport, newGame, type ExportFile, type LengthsEntry, type LibraryGame } from "@backlog/shared/files";
import { compare, matches, type Entry, type Filter, type SortKey } from "@backlog/shared/filter";
import { resolveLength } from "@backlog/shared/lengths";
import { after, between, newShareId, type List, type ListItem, type ListKind, type Visibility } from "@backlog/shared/lists";
import { normalizeName } from "@backlog/shared/names";
import { userFields, type GameFields, type ItemFields, type ListFields, type Op, type SyncItem, type SyncList, type SyncView, type ViewFields } from "@backlog/shared/sync";
import { STATUSES, STATUS_LABEL, type Game, type LenKind, type Lengths, type Measure, type Status } from "@backlog/shared/types";
import { builtInViews, canonical, sameView, type View } from "@backlog/shared/views";
import * as db from "./db.ts";
import { listPath, navigate, route } from "./route.ts";
import { download } from "./util.ts";

export type Theme = "system" | "dark" | "light";
export type Settings = { theme: Theme; measure: Measure };
const DEFAULT_SETTINGS: Settings = { theme: "system", measure: "main_extra" };

// ---- Data ----

export const games = signal<ReadonlyMap<number, Game>>(new Map());
export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const loaded = signal(false);
/** The one-time triage prompt was answered (SPEC §2.4). */
export const triaged = signal(false);

export async function load() {
  const [all, s, t, v, l] = await Promise.all([
    db.loadGames(), db.getMeta<Settings>("settings"), db.getMeta<boolean>("triaged"), db.loadViews(), db.loadLists(),
  ]);
  batch(() => {
    games.value = new Map(all.map(g => [g.appid, g]));
    userViews.value = v;
    // Lists from before share ids had a slug instead; a signed-in account's lists get theirs from the server
    lists.value = l.lists.map(x => (x.shareId ? x : { ...x, shareId: newShareId() }));
    listItems.value = groupItems(l.items);
    settings.value = { ...DEFAULT_SETTINGS, ...s };
    triaged.value = t ?? false;
    loaded.value = true;
  });
}

export function updateSettings(s: Partial<Settings>) {
  settings.value = { ...settings.value, ...s };
  void db.setMeta("settings", settings.value);
}

effect(() => {
  const t = settings.value.theme;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
});

// ---- Derived ----

const keys = new Map<string, string>();
const keyOf = (name: string) => {
  let k = keys.get(name);
  if (k === undefined) keys.set(name, (k = normalizeName(name)));
  return k;
};

// Entries are reused while their game object is unchanged, so memoized cards skip re-rendering.
let entryCache = new WeakMap<Game, Entry>();
let cachedMeasure: Measure | null = null;

export const entries = computed<Entry[]>(() => {
  const m = settings.value.measure;
  if (m !== cachedMeasure) { entryCache = new WeakMap(); cachedMeasure = m; }
  return [...games.value.values()].map(game => {
    let e = entryCache.get(game);
    if (!e) entryCache.set(game, (e = { game, len: resolveLength(game, m), key: keyOf(game.name) }));
    return e;
  });
});

export const byId = computed(() => new Map(entries.value.map(e => [e.game.appid, e])));

/** Backlog games played for at least 80% of their length: probably finished before the import. */
export const triageCandidates = computed(() =>
  entries.value.filter(e => e.game.status === "backlog" && e.len.hours != null && e.game.playtimeMin >= 0.8 * e.len.hours * 60));

export const isOpen = (s: Status) => s === "backlog" || s === "playing";
const needsLength = (e: Entry) => e.len.hours == null && !e.len.endless;

export const totals = computed(() => {
  let left = 0, leftHours = 0, unknown = 0, finished = 0, finishedHours = 0;
  for (const e of entries.value) {
    if (isOpen(e.game.status)) {
      left++;
      leftHours += e.len.hours ?? 0;
      if (needsLength(e)) unknown++;
    } else if (e.game.status === "finished") {
      finished++;
      finishedHours += e.len.hours ?? 0;
    }
  }
  return { left, leftHours, unknown, finished, finishedHours };
});

// ---- View state ----

export const query = signal("");
export const statuses = signal<Status[]>(["backlog", "playing"]);
export const played = signal<NonNullable<Filter["played"]>>("any");
export const sortKey = signal<SortKey>("length");

/** Filter fields the toolbar has no control for (length range, dates); set by views, shown as removable pills. */
export const extra = signal<Filter>({});

/** What the library shows, without the search text: compared against views to find the active one. */
export const currentFilter = computed(() => canonical({ statuses: statuses.value, played: played.value, ...extra.value }));

export const visible = computed(() => {
  const l = currentList.value;
  if (l) {
    const f: Filter = { statuses: listStatuses.value, q: query.value };
    const shown = listEntries(l).filter(e => matches(e, f));
    return listSort.value === "list" ? shown : shown.sort(compare(listSort.value));
  }
  const f: Filter = { ...currentFilter.value, q: query.value };
  return entries.value.filter(e => matches(e, f)).sort(compare(sortKey.value));
});

/** The sort in use: the library's, or the open list's. */
export const sorting = computed<ListSort>(() => (currentList.value ? listSort.value : sortKey.value));

// ---- Smart views ----

export const userViews = signal<View[]>([]);
export const views = computed(() => [...builtInViews(), ...[...userViews.value].sort((a, b) => a.position.localeCompare(b.position))]);
export const activeView = computed(() => views.value.find(v => sameView(v, { filter: currentFilter.value, sort: sortKey.value })) ?? null);

export function applyView(v: View) {
  const { statuses: st, played: pl, q: _q, ...rest } = v.filter;
  batch(() => {
    statuses.value = st?.length ? st : STATUSES;
    played.value = pl ?? "any";
    extra.value = rest;
    sortKey.value = v.sort;
  });
}

const viewFields = ({ name, filter, sort, position }: View): ViewFields => ({ name, filter, sort, position, deleted: false });

function addView(v: View) {
  userViews.value = [...userViews.value, v];
  void db.putView(v);
  onUserChanges?.([{ viewId: v.id, set: viewFields(v) }]);
}

export function saveView(name: string) {
  addView({ id: crypto.randomUUID(), name, filter: currentFilter.value, sort: sortKey.value, position: Date.now().toString(36) });
}

export function deleteView(id: string) {
  const v = userViews.value.find(x => x.id === id);
  if (!v) return;
  userViews.value = userViews.value.filter(x => x.id !== id);
  void db.deleteView(id);
  onUserChanges?.([{ viewId: id, set: { deleted: true } }]);
  pushUndo({ label: `View "${v.name}" deleted`, patches: [], revert: () => addView(v) });
}

/** Local views as changes, for the first sign-in on this device. */
export const localViewChanges = (): UserChange[] => userViews.value.map(v => ({ viewId: v.id, set: viewFields(v) }));

/** Views from the server, with view ops still in the outbox applied on top. `replace` drops views the server didn't send. */
export function applyServerViews(list: SyncView[], pending: Op[], replace = false) {
  if (!list.length && !replace) return;
  const next = new Map(replace ? [] : userViews.value.map(v => [v.id, v]));
  for (const { deleted, ...v } of list) deleted ? next.delete(v.id) : next.set(v.id, v);
  for (const op of pending) {
    if (op.type !== "view") continue;
    const { deleted, ...set } = op.set;
    const cur = next.get(op.viewId);
    if (deleted) next.delete(op.viewId);
    else if (cur || (set.name && set.filter && set.sort && set.position != null)) next.set(op.viewId, { ...cur!, ...set, id: op.viewId });
  }
  userViews.value = [...next.values()];
  void db.replaceViews(userViews.value);
}

// ---- Lists ----

export const lists = signal<List[]>([]);
/** Games of each hand-picked list: appid → position. */
export const listItems = signal<ReadonlyMap<string, ReadonlyMap<number, string>>>(new Map());
export const sortedLists = computed(() => [...lists.value].sort((a, b) => (a.position < b.position ? -1 : 1)));
/** The user's own list whose page is shown, or null: on the library, and on someone else's (or a missing) list. */
export const currentList = computed(() => {
  const r = route.value;
  if (r.page === "list") return lists.value.find(l => l.id === r.id) ?? null;
  if (r.page === "shared") return lists.value.find(l => l.shareId === r.shareId) ?? null;
  return null;
});
/** A shared list page of a list that isn't the user's: read-only. */
export const viewing = computed(() => route.value.page === "shared" && !currentList.value);

// Old /l/<id> addresses move to the list's link
effect(() => {
  const r = route.value, l = currentList.value;
  if (r.page === "list" && l) navigate(listPath(l), true);
});

/** "list" is a hand-picked list's own order. */
export type ListSort = SortKey | "list";
/** A list page's filter, separate from the library's: lists start with every status shown. */
export const listStatuses = signal<Status[]>(STATUSES);
export const listSort = signal<ListSort>("list");
let shownList: string | null = null;
effect(() => {
  const l = currentList.value;
  if ((l?.id ?? null) === shownList) return;
  shownList = l?.id ?? null;
  batch(() => {
    query.value = "";
    if (!l) return;
    listStatuses.value = STATUSES;
    listSort.value = l.kind === "manual" ? "list" : l.sort ?? "length";
  });
});

function groupItems(items: ListItem[]) {
  const out = new Map<string, Map<number, string>>();
  for (const i of items) {
    let m = out.get(i.listId);
    if (!m) out.set(i.listId, (m = new Map()));
    m.set(i.appid, i.position);
  }
  return out;
}

/** Appids of a hand-picked list in its order. */
export function listOrder(id: string): number[] {
  return [...(listItems.value.get(id) ?? [])].sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([appid]) => appid);
}

/** Games of a list in its order (hand-picked), or the games its filter matches, by its sort. */
export function listEntries(l: List): Entry[] {
  if (l.kind === "filter") return entries.value.filter(e => matches(e, l.filter ?? {})).sort(compare(l.sort ?? "length"));
  const ids = byId.value;
  return listOrder(l.id).map(id => ids.get(id)).filter((e): e is Entry => !!e);
}

/** Lists a game is in, for the detail panel. */
export const listsOf = (appid: number) => sortedLists.value.filter(l => l.kind === "manual" && listItems.value.get(l.id)?.has(appid));

const listFields = ({ id: _id, ...rest }: List): ListFields => ({ ...rest, deleted: false });

function putList(l: List, set: Partial<ListFields> = listFields(l)) {
  lists.value = [...lists.value.filter(x => x.id !== l.id), l];
  void db.saveLists([l], []);
  onUserChanges?.([{ listId: l.id, set }]);
}

/** Sets positions of games in a list; a null position takes the game out. */
function putItems(listId: string, changes: [appid: number, position: string | null][]) {
  if (!changes.length) return;
  const all = new Map(listItems.value);
  const cur = new Map(all.get(listId));
  const put: ListItem[] = [], removed: ListItem[] = [];
  for (const [appid, position] of changes) {
    if (position == null) { cur.delete(appid); removed.push({ listId, appid, position: "" }); }
    else { cur.set(appid, position); put.push({ listId, appid, position }); }
  }
  all.set(listId, cur);
  listItems.value = all;
  void db.saveLists([], put, removed);
  onUserChanges?.(changes.map(([appid, position]) => ({ listId, appid, set: position == null ? { deleted: true } : { position, deleted: false } })));
}

function dropList(id: string) {
  const all = new Map(listItems.value);
  const items = [...(all.get(id) ?? [])].map(([appid, position]) => ({ listId: id, appid, position }));
  all.delete(id);
  batch(() => {
    lists.value = lists.value.filter(x => x.id !== id);
    listItems.value = all;
  });
  void db.saveLists([], [], items, [id]);
  onUserChanges?.([{ listId: id, set: { deleted: true } }]);
  if (currentList.peek() === null && route.peek().page !== "library") navigate("/", true);
}

/** A new list: hand-picked (with `appids` in it), or one that keeps the games of the library's current filter. */
export function createList(title: string, kind: ListKind = "manual", appids: number[] = []): List {
  const l: List = {
    id: crypto.randomUUID(), title, description: "", kind,
    filter: kind === "filter" ? currentFilter.value : null, sort: kind === "filter" ? sortKey.value : null,
    shareId: newShareId(), visibility: "private",
    position: between(sortedLists.value.at(-1)?.position ?? null, null),
  };
  putList(l);
  const keys = after(null, appids.length);
  putItems(l.id, appids.map((id, i) => [id, keys[i]]));
  pushUndo({ label: appids.length ? `${subject(appids)} → ${title}` : `List "${title}" created`, patches: [], revert: () => dropList(l.id) });
  return l;
}

/** Adds games at the end of a list; ones already in it stay where they are. */
export function addToList(listId: string, appids: number[]) {
  const l = lists.value.find(x => x.id === listId);
  const cur = listItems.value.get(listId);
  const add = [...new Set(appids)].filter(id => !cur?.has(id));
  if (!l) return;
  if (!add.length) return showToast(`Already in ${l.title}`);
  const keys = after(listOrder(listId).map(id => cur!.get(id)!).at(-1) ?? null, add.length);
  putItems(listId, add.map((id, i) => [id, keys[i]]));
  pushUndo({ label: `${subject(add)} → ${l.title}`, patches: [], revert: () => putItems(listId, add.map(id => [id, null])) });
}

export function removeFromList(listId: string, appids: number[]) {
  const l = lists.value.find(x => x.id === listId);
  const cur = listItems.value.get(listId);
  const gone = appids.filter(id => cur?.has(id)).map((id): [number, string] => [id, cur!.get(id)!]);
  if (!l || !gone.length) return;
  putItems(listId, gone.map(([id]) => [id, null]));
  pushUndo({ label: `${subject(gone.map(g => g[0]))} removed from ${l.title}`, patches: [], revert: () => putItems(listId, gone) });
}

/** Adds the games, or takes them out when they're all in already: what picking a list in the picker does. */
export function toggleInList(listId: string, appids: number[]) {
  const cur = listItems.value.get(listId);
  if (appids.every(id => cur?.has(id))) removeFromList(listId, appids);
  else addToList(listId, appids);
}

/** Whether the shown list can be reordered: a hand-picked one, in its own order. */
export const canReorder = computed(() => currentList.value?.kind === "manual" && listSort.value === "list");

/** Moves a game of a hand-picked list just before or after another one. */
export function moveInList(listId: string, appid: number, target: number, side: "before" | "after") {
  const cur = listItems.value.get(listId);
  const old = cur?.get(appid);
  if (!cur || old == null || target === appid) return;
  const full = listOrder(listId);
  const order = full.filter(id => id !== appid);
  const t = order.indexOf(target);
  if (t < 0) return;
  const i = side === "before" ? t : t + 1;
  if (i === full.indexOf(appid)) return; // already there
  const position = between(i > 0 ? cur.get(order[i - 1])! : null, i < order.length ? cur.get(order[i])! : null);
  putItems(listId, [[appid, position]]);
  pushUndo({ label: `${nameOf(appid)} moved`, patches: [], revert: () => putItems(listId, [[appid, old]]) });
}

/** Renames or describes a list. */
export function updateList(id: string, change: Partial<Pick<List, "title" | "description">>) {
  const l = lists.value.find(x => x.id === id);
  if (!l) return;
  const next = { ...l, ...change };
  const fields = (x: List): Partial<ListFields> => ({ title: x.title, description: x.description });
  putList(next, fields(next));
  pushUndo({ label: change.title ? `Renamed to ${change.title}` : "Description saved", patches: [], revert: () => putList(l, fields(l)) });
}

/** Shares a list by link, or makes it private again (its link stops working). */
export function setListVisibility(id: string, visibility: Visibility) {
  const l = lists.value.find(x => x.id === id);
  if (!l || l.visibility === visibility) return;
  putList({ ...l, visibility }, { visibility });
  pushUndo({ label: visibility === "private" ? `${l.title} is private` : `${l.title} is shared`, patches: [],
    revert: () => putList(l, { visibility: l.visibility }) });
}

export function deleteList(id: string) {
  const l = lists.value.find(x => x.id === id);
  if (!l) return;
  const items = listOrder(id).map((appid): [number, string] => [appid, listItems.value.get(id)!.get(appid)!]);
  dropList(id);
  pushUndo({ label: `List "${l.title}" deleted`, patches: [], revert: () => { putList(l); putItems(id, items); } });
}

/** Local lists as changes, for the first sign-in on this device. */
export const localListChanges = (): UserChange[] => lists.value.flatMap(l => [
  { listId: l.id, set: listFields(l) },
  ...[...(listItems.value.get(l.id) ?? [])].map(([appid, position]) => ({ listId: l.id, appid, set: { position, deleted: false } })),
]);

/** Lists and items from the server, with list ops still in the outbox applied on top. `replace` drops what the server didn't send. */
export function applyServerLists(ls: SyncList[], its: SyncItem[], pending: Op[], replace = false) {
  if (!ls.length && !its.length && !replace) return;
  const next = new Map(replace ? [] : lists.value.map(l => [l.id, l]));
  const items = new Map([...(replace ? [] : listItems.value)].map(([id, m]) => [id, new Map(m)]));
  const itemsOf = (id: string) => items.get(id) ?? items.set(id, new Map()).get(id)!;
  for (const { deleted, ...l } of ls) deleted ? next.delete(l.id) : next.set(l.id, l);
  for (const { deleted, listId, appid, position } of its) deleted ? items.get(listId)?.delete(appid) : itemsOf(listId).set(appid, position);
  for (const op of pending) {
    if (op.type === "list") {
      const { deleted, ...set } = op.set;
      const cur = next.get(op.listId);
      if (deleted) next.delete(op.listId);
      else if (cur || (set.title && set.kind && set.shareId && set.position)) next.set(op.listId, { ...cur!, ...set, id: op.listId });
    } else if (op.type === "item") {
      if (op.set.deleted) items.get(op.listId)?.delete(op.appid);
      else if (op.set.position) itemsOf(op.listId).set(op.appid, op.set.position);
    }
  }
  for (const id of items.keys()) if (!next.has(id)) items.delete(id);
  batch(() => {
    lists.value = [...next.values()];
    listItems.value = items;
  });
  const flat = [...items].flatMap(([listId, m]) => [...m].map(([appid, position]) => ({ listId, appid, position })));
  void db.saveLists(lists.value, flat, [], [], true);
}

export const listsOpen = signal(false);
/** Games the "Add to list" picker is open for. */
export const pickerFor = signal<number[] | null>(null);

/** The Now playing shelf: every Playing game whatever the view, most recently started first. */
export const nowPlaying = computed(() =>
  entries.value.filter(e => e.game.status === "playing").sort((a, b) => (b.game.statusAt ?? 0) - (a.game.statusAt ?? 0)));

/** What the library shows: one shelf per length band, or a single one for other sorts. */
export const shelves = computed<{ band: Band | null; entries: Entry[] }[]>(() => {
  const list = visible.value;
  if (sorting.value !== "length") return list.length ? [{ band: null, entries: list }] : [];
  return BANDS.map(band => ({ band, entries: list.filter(e => bandOf(e.len) === band) })).filter(s => s.entries.length);
});

/** Bulk selection (SPEC §6). Only games on screen stay selected, so an action never touches hidden ones. */
export const selection = signal<ReadonlySet<number>>(new Set());
let anchor: number | null = null;
const shownOrder = () => shelves.value.flatMap(s => s.entries.map(e => e.game.appid));

/** Toggles one game; with `range`, selects everything between the last toggled game and this one. */
export function toggleSelected(id: number, range = false) {
  const next = new Set(selection.value);
  const order = range && anchor != null ? shownOrder() : [];
  const [a, b] = [order.indexOf(anchor!), order.indexOf(id)];
  if (a >= 0 && b >= 0) for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
  else if (!next.delete(id)) next.add(id);
  anchor = id;
  selection.value = next;
}

export function selectAll() { selection.value = new Set(shownOrder()); }
export function clearSelection() { selection.value = new Set(); anchor = null; }

effect(() => {
  const sel = selection.value;
  if (!sel.size) return;
  const shown = new Set(visible.value.map(e => e.game.appid));
  if ([...sel].some(id => !shown.has(id))) selection.value = new Set([...sel].filter(id => shown.has(id)));
});

export const openId = signal<number | null>(null);
/** A card to focus: its shelf scrolls it into view, focuses it once mounted, then clears this. */
export const focusTarget = signal<number | null>(null);
export const editingId = signal<number | null>(null); // inline length editor on a card
export const fillInQueue = signal<number[] | null>(null);
export const settingsOpen = signal(false);
export const shortcutsOpen = signal(false);
export const paletteOpen = signal(false);

// Closing the detail panel returns focus to its card
let lastOpen: number | null = null;
effect(() => {
  const id = openId.value;
  if (id == null && lastOpen != null) focusTarget.value = lastOpen;
  lastOpen = id;
});
// A target that isn't shown (filtered out, finished) would otherwise grab focus when it comes back
effect(() => {
  const t = focusTarget.value;
  if (t != null && !visible.value.some(e => e.game.appid === t)) focusTarget.value = null;
});

/** Open games without a length: ones with Steam playtime first, then by name. */
export function startFillIn(only?: number[]) {
  const pool = only ? only.map(id => byId.value.get(id)!).filter(Boolean) : entries.value.filter(e => isOpen(e.game.status));
  const queue = pool.filter(needsLength)
    .sort((a, b) => b.game.playtimeMin - a.game.playtimeMin || a.game.name.localeCompare(b.game.name))
    .map(e => e.game.appid);
  if (queue.length) fillInQueue.value = queue;
  else showToast("Every game here has a length");
}

// ---- Toast ----

export type Toast = { id: number; message: string; undoable: boolean };
export const toast = signal<Toast | null>(null);
let toastId = 0;
export function showToast(message: string, undoable = false) {
  toast.value = { id: ++toastId, message, undoable };
}

// ---- Commands with undo ----

type Patch = { appid: number; before: Partial<Game>; after: Partial<Game> };
/** An undoable action: game patches, or `revert` for anything else (views). */
type Command = { label: string; patches: Patch[]; revert?: () => void };
const undoStack: Command[] = [];
const UNDO_LIMIT = 100;

/** A change the account should sync: fields of a game, a view, a list, or a game in a list. */
export type UserChange =
  | { appid: number; set: Partial<GameFields> }
  | { viewId: string; set: Partial<ViewFields> }
  | { listId: string; set: Partial<ListFields> }
  | { listId: string; appid: number; set: Partial<ItemFields> };
let onUserChanges: ((changes: UserChange[]) => void) | null = null;
/** Called with every change to the user's own fields; account.ts turns them into sync ops. */
export function listenUserChanges(fn: typeof onUserChanges) {
  onUserChanges = fn;
}

function apply(patches: Patch[], side: "before" | "after") {
  const next = new Map(games.value);
  const changed: Game[] = [];
  const userChanges: UserChange[] = [];
  for (const p of patches) {
    const g = next.get(p.appid);
    if (!g) continue;
    const n = { ...g, ...p[side] };
    next.set(p.appid, n);
    changed.push(n);
    const set = userFields(p[side]);
    if (set) userChanges.push({ appid: p.appid, set });
  }
  games.value = next;
  db.saveGames(changed);
  if (userChanges.length) onUserChanges?.(userChanges);
}

/** Build patches for `appids`; `change` returns the new fields, or null to leave a game alone. */
function patches(appids: number[], change: (g: Game) => Partial<Game> | null): Patch[] {
  const out: Patch[] = [];
  for (const id of appids) {
    const g = games.value.get(id);
    const after = g && change(g);
    if (!g || !after) continue;
    const before = Object.fromEntries(Object.keys(after).map(k => [k, g[k as keyof Game]])) as Partial<Game>;
    out.push({ appid: id, before, after });
  }
  return out;
}

function run(label: string, ps: Patch[]) {
  if (!ps.length) return;
  apply(ps, "after");
  pushUndo({ label, patches: ps });
}

function pushUndo(c: Command) {
  undoStack.push(c);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  showToast(c.label, true);
}

export function undo() {
  const c = undoStack.pop();
  if (!c) return showToast("Nothing to undo");
  if (c.revert) c.revert();
  else apply(c.patches, "before");
  showToast(`Undone: ${c.label}`);
}

const nameOf = (id: number) => games.value.get(id)?.name ?? "Game";
const subject = (ids: number[]) => (ids.length === 1 ? nameOf(ids[0]) : `${ids.length} games`);

export function setStatus(appids: number[], status: Status) {
  const now = Date.now();
  const ps = patches(appids, g => (g.status === status ? null : {
    status, statusAt: now, finishedAt: status === "finished" ? now : g.finishedAt,
  }));
  run(`${subject(ps.map(p => p.appid))} → ${STATUS_LABEL[status]}`, ps);
}

/** Answers the triage prompt. Finished on the day they were last played, the best guess Steam gives. */
export function finishPlayed(appids: number[]) {
  const now = Date.now();
  const ps = patches(appids, g => (g.status !== "backlog" ? null : { status: "finished", statusAt: now, finishedAt: g.lastPlayedAt ?? now }));
  run(`${subject(ps.map(p => p.appid))} → Finished`, ps);
  dismissTriage();
}

export function dismissTriage() {
  triaged.value = true;
  void db.setMeta("triaged", true);
}

/** Set the user's own length. `null` lengths with kind "endless" mark a game as having no ending. */
export function setMyLength(appid: number, my: Lengths | null, kind: LenKind | null) {
  const ps = patches([appid], () => ({ my, myKind: kind }));
  const label = kind === "endless" ? "no ending"
    : !my ? "length removed"
    : formatHours(my[settings.value.measure] ?? my.main_extra ?? my.main ?? my.comp, kind === "approx", true);
  run(`${nameOf(appid)}: ${label}`, ps);
}

/** A single typed value applies to the current measure. */
export function lengthsFor(hours: number): Lengths {
  return settings.value.measure === "main" ? { main: hours, main_extra: null, comp: null } : { main: null, main_extra: hours, comp: null };
}

export function importLengths(list: LengthsEntry[]): { applied: number; unknownGames: number } {
  const known = list.filter(l => games.value.has(l.appid));
  const lengths = new Map(known.map(l => [l.appid, l.lengths]));
  run(`Imported ${known.length} lengths`, patches([...lengths.keys()], g => ({ my: lengths.get(g.appid)!, myKind: "imported" })));
  return { applied: known.length, unknownGames: list.length - known.length };
}

// ---- Silent updates (no undo) ----

const silent = new Map<number, Partial<Game>>();
let silentTimer: ReturnType<typeof setTimeout> | null = null;

/** Small background updates (art probing, notes), coalesced so image loads don't re-render per image. */
export function updateQuietly(appid: number, change: Partial<Game>, delay = 150) {
  silent.set(appid, { ...silent.get(appid), ...change });
  if (silentTimer) return;
  silentTimer = setTimeout(() => {
    silentTimer = null;
    apply([...silent].map(([id, after]) => ({ appid: id, before: {}, after })), "after");
    silent.clear();
  }, delay);
}

// ---- Bulk data operations ----

/** Add new games and refresh catalog fields of known ones. The user's own fields are kept. */
export function mergeLibrary(list: LibraryGame[]): { added: number; updated: number } {
  const now = Date.now();
  const next = new Map(games.value);
  let added = 0, updated = 0;
  for (const l of list) {
    const g = next.get(l.appid);
    if (g) {
      next.set(l.appid, { ...g, name: l.name, igdb: l.igdb ?? g.igdb, playtimeMin: l.playtimeMin ?? g.playtimeMin, lastPlayedAt: l.lastPlayedAt ?? g.lastPlayedAt });
      updated++;
    } else {
      next.set(l.appid, newGame(l, now));
      added++;
    }
  }
  games.value = next;
  db.saveGames(next.values());
  return { added, updated };
}

/** Restore a backup. "merge" overwrites the user's fields for games in the file; "replace" starts over from it. */
export async function restoreBackup(file: ExportFile, mode: "merge" | "replace") {
  const { games: list, settings: s } = file as ExportFile & { settings?: Partial<Settings> };
  if (mode === "replace") await db.clearAll();
  const now = Date.now();
  const next = new Map(mode === "replace" ? [] : games.value);
  const userChanges: UserChange[] = [];
  for (const e of list) {
    const base = next.get(e.appid) ?? newGame({ appid: e.appid, name: e.name, playtimeMin: e.playtimeMin, addedAt: e.addedAt }, now);
    const set = { status: e.status, statusAt: e.statusAt, finishedAt: e.finishedAt, note: e.note, my: e.my, myKind: e.myKind };
    next.set(e.appid, { ...base, ...set });
    userChanges.push({ appid: e.appid, set });
  }
  // Views and lists from the file replace ones with the same id; with "replace", the others go
  const keep = <T extends { id: string }>(cur: T[], from: T[]) => [...(mode === "replace" ? [] : cur.filter(x => !from.some(f => f.id === x.id))), ...from];
  const fileViews = file.views ?? [], fileLists = file.lists ?? [];
  const nextViews = keep(userViews.value, fileViews), nextLists = keep(lists.value, fileLists);
  const fileItems = groupItems(file.listItems ?? []);
  const nextItems = new Map(mode === "replace" ? [] : listItems.value);
  for (const l of fileLists) {
    for (const appid of nextItems.get(l.id)?.keys() ?? []) {
      if (!fileItems.get(l.id)?.has(appid)) userChanges.push({ listId: l.id, appid, set: { deleted: true } });
    }
    nextItems.set(l.id, fileItems.get(l.id) ?? new Map());
  }
  for (const id of nextItems.keys()) if (!nextLists.some(l => l.id === id)) nextItems.delete(id);
  for (const v of fileViews) userChanges.push({ viewId: v.id, set: viewFields(v) });
  for (const l of fileLists) {
    userChanges.push({ listId: l.id, set: listFields(l) });
    for (const [appid, position] of nextItems.get(l.id)!) userChanges.push({ listId: l.id, appid, set: { position, deleted: false } });
  }

  undoStack.length = 0;
  batch(() => {
    games.value = next;
    userViews.value = nextViews;
    lists.value = nextLists;
    listItems.value = nextItems;
  });
  db.saveGames(next.values());
  void db.replaceViews(nextViews);
  void db.saveLists(nextLists, [...nextItems].flatMap(([listId, m]) => [...m].map(([appid, position]) => ({ listId, appid, position }))), [], [], true);
  onUserChanges?.(userChanges);
  if (s) updateSettings({ ...(s.theme ? { theme: s.theme } : {}), ...(s.measure ? { measure: s.measure } : {}) });
}

/**
 * Games from the server replace local ones; ops still in the outbox are applied on top so local
 * changes the server hasn't seen yet don't flicker back. `replace` drops games the server didn't send.
 */
export function applyServerGames(list: Game[], pending: Op[], replace = false) {
  const next = new Map(replace ? [] : games.value);
  const changed: Game[] = [];
  for (const g of list) {
    const local = games.value.get(g.appid);
    next.set(g.appid, { ...g, portrait: g.portrait ?? local?.portrait ?? null });
  }
  for (const op of pending) {
    const g = op.type === "game" && next.get(op.appid);
    if (g) next.set(g.appid, { ...g, ...op.set });
  }
  for (const g of list) changed.push(next.get(g.appid)!);
  if (replace) void db.replaceGames(next.values());
  else db.saveGames(changed);
  games.value = next;
}

export function exportBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  const items = [...listItems.value].flatMap(([listId, m]) => [...m].map(([appid, position]) => ({ listId, appid, position })));
  download(`backlog-${stamp}.json`, makeExport([...games.value.values()], settings.value, { views: userViews.value, lists: lists.value, listItems: items }));
}

export async function deleteEverything() {
  // Memory first: an update landing while IndexedDB clears (art probing, a sync) then finds no game to write back
  undoStack.length = 0;
  silent.clear();
  batch(() => {
    games.value = new Map();
    settings.value = DEFAULT_SETTINGS;
    triaged.value = false;
    selection.value = new Set();
    userViews.value = [];
    lists.value = [];
    listItems.value = new Map();
    pickerFor.value = null;
    listsOpen.value = false;
    openId.value = null;
    settingsOpen.value = false;
  });
  await db.clearAll();
}
