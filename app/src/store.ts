import { batch, computed, effect, signal } from "@preact/signals";
import { formatHours } from "@backlog/shared/bands";
import { newGame, type ExportGame, type LengthsEntry, type LibraryGame } from "@backlog/shared/files";
import { compare, matches, type Entry, type Filter, type SortKey } from "@backlog/shared/filter";
import { resolveLength } from "@backlog/shared/lengths";
import { normalizeName } from "@backlog/shared/names";
import { userFields, type GameFields, type Op } from "@backlog/shared/sync";
import { STATUS_LABEL, type Game, type LenKind, type Lengths, type Measure, type Status } from "@backlog/shared/types";
import * as db from "./db.ts";

export type Theme = "system" | "dark" | "light";
export type Settings = { theme: Theme; measure: Measure };
const DEFAULT_SETTINGS: Settings = { theme: "system", measure: "main_extra" };

// ---- Data ----

export const games = signal<ReadonlyMap<number, Game>>(new Map());
export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const loaded = signal(false);

export async function load() {
  const [all, s] = await Promise.all([db.loadGames(), db.getMeta<Settings>("settings")]);
  batch(() => {
    games.value = new Map(all.map(g => [g.appid, g]));
    settings.value = { ...DEFAULT_SETTINGS, ...s };
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

export const visible = computed(() => {
  const f: Filter = { statuses: statuses.value, q: query.value, played: played.value };
  return entries.value.filter(e => matches(e, f)).sort(compare(sortKey.value));
});

export const openId = signal<number | null>(null);
export const editingId = signal<number | null>(null); // inline length editor on a card
export const fillInQueue = signal<number[] | null>(null);
export const settingsOpen = signal(false);

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
type Command = { label: string; patches: Patch[] };
const undoStack: Command[] = [];
const UNDO_LIMIT = 100;

export type UserChange = { appid: number; set: Partial<GameFields> };
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
  undoStack.push({ label, patches: ps });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  showToast(label, true);
}

export function undo() {
  const c = undoStack.pop();
  if (!c) return showToast("Nothing to undo");
  apply(c.patches, "before");
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
export async function restoreBackup(list: ExportGame[], mode: "merge" | "replace", s?: Partial<Settings>) {
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
  undoStack.length = 0;
  games.value = next;
  db.saveGames(next.values());
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
    const g = next.get(op.appid);
    if (g) next.set(op.appid, { ...g, ...op.set });
  }
  for (const g of list) changed.push(next.get(g.appid)!);
  if (replace) void db.replaceGames(next.values());
  else db.saveGames(changed);
  games.value = next;
}

export async function deleteEverything() {
  await db.clearAll();
  undoStack.length = 0;
  batch(() => {
    games.value = new Map();
    settings.value = DEFAULT_SETTINGS;
    openId.value = null;
    settingsOpen.value = false;
  });
}
