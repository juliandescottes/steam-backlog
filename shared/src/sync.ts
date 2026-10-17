/* Sync protocol between the client outbox and the Worker (TECH.md §5). */
import { SORT_LABEL } from "./filter.ts";
import type { List, ListItem } from "./lists.ts";
import { STATUSES, type Game, type LenKind } from "./types.ts";
import type { View } from "./views.ts";

/** The user's own fields of a game: the only ones the client changes. */
export type GameFields = Pick<Game, "status" | "statusAt" | "finishedAt" | "note" | "my" | "myKind">;
export const GAME_FIELDS = ["status", "statusAt", "finishedAt", "note", "my", "myKind"] as const satisfies (keyof GameFields)[];

/** The user's own fields within a change to a game, or null when it only touches catalog fields. */
export function userFields(change: Partial<Game>): Partial<GameFields> | null {
  const out: Partial<GameFields> = {};
  for (const k of GAME_FIELDS) if (k in change) (out as any)[k] = change[k];
  return Object.keys(out).length ? out : null;
}

/**
 * Sets fields of one game to new values. Ops carry values rather than actions ("finish this game"),
 * so undo is just another op and replaying one is harmless.
 */
export type GameOp = { id: string; type: "game"; appid: number; at: number; set: Partial<GameFields> };

/** A smart view's fields; deleting one sets `deleted`, so other devices learn about it and undo is another op. */
export type ViewFields = Pick<View, "name" | "filter" | "sort" | "position"> & { deleted: boolean };
export type ViewOp = { id: string; type: "view"; viewId: string; at: number; set: Partial<ViewFields> };

/** A list's fields; like views, deleting one sets `deleted`. */
export type ListFields = Omit<List, "id"> & { deleted: boolean };
export type ListOp = { id: string; type: "list"; listId: string; at: number; set: Partial<ListFields> };
/** A game's place in a hand-picked list; taking it out sets `deleted`. */
export type ItemFields = { position: string; deleted: boolean };
export type ItemOp = { id: string; type: "item"; listId: string; appid: number; at: number; set: Partial<ItemFields> };

export type Op = GameOp | ViewOp | ListOp | ItemOp;
export type SyncView = View & { deleted: boolean };
export type SyncList = List & { deleted: boolean };
export type SyncItem = ListItem & { deleted: boolean };

/** `since` is the last rev seen; `catalogSince` the last catalogAt (IGDB and community lengths change without a rev). */
export type SyncRequest = { since: number; catalogSince: number; ops: Op[] };
export type SyncResponse = { rev: number; catalogAt: number; games: Game[]; views: SyncView[]; lists: SyncList[]; items: SyncItem[] };

const KINDS: LenKind[] = ["exact", "approx", "endless", "imported"];
const time = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const hours = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 100_000);

const SORTS = Object.keys(SORT_LABEL);
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;

export function validOp(o: unknown): o is Op {
  if (!o || typeof o !== "object") return false;
  const op = o as Op;
  if (!text(op.id, 64) || !op.id || !time(op.at) || !op.set || typeof op.set !== "object") return false;
  if (op.type === "view") return validViewOp(op);
  if (op.type === "list") return validListOp(op);
  if (op.type === "item") return validItemOp(op);
  if (op.type !== "game" || !Number.isInteger(op.appid) || op.appid <= 0) return false;
  const s = op.set;
  return (!("status" in s) || STATUSES.includes(s.status!))
    && (!("statusAt" in s) || time(s.statusAt))
    && (!("finishedAt" in s) || time(s.finishedAt))
    && (!("note" in s) || (typeof s.note === "string" && s.note.length <= 10_000))
    && (!("myKind" in s) || s.myKind === null || KINDS.includes(s.myKind!))
    && (!("my" in s) || s.my === null || (typeof s.my === "object" && hours(s.my.main) && hours(s.my.main_extra) && hours(s.my.comp)));
}

function validViewOp(op: ViewOp): boolean {
  const s = op.set;
  return text(op.viewId, 64) && !!op.viewId
    && (!("name" in s) || (text(s.name, 60) && !!s.name!.trim()))
    && (!("filter" in s) || filterJson(s.filter))
    && (!("sort" in s) || SORTS.includes(s.sort!))
    && (!("position" in s) || text(s.position, 32))
    && (!("deleted" in s) || typeof s.deleted === "boolean");
}

const KIND = ["manual", "filter"];
const VISIBILITY = ["private", "link", "profile"];
const position = (v: unknown) => typeof v === "string" && /^[0-9a-z]{1,64}$/.test(v);
const filterJson = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) && JSON.stringify(v).length <= 2000;

function validListOp(op: ListOp): boolean {
  const s = op.set;
  return text(op.listId, 64) && !!op.listId
    && (!("title" in s) || (text(s.title, 80) && !!s.title!.trim()))
    && (!("description" in s) || text(s.description, 1000))
    && (!("kind" in s) || KIND.includes(s.kind!))
    && (!("filter" in s) || s.filter === null || filterJson(s.filter))
    && (!("sort" in s) || s.sort === null || SORTS.includes(s.sort!))
    && (!("slug" in s) || (typeof s.slug === "string" && /^[\p{L}\p{N}-]{1,60}$/u.test(s.slug)))
    && (!("visibility" in s) || VISIBILITY.includes(s.visibility!))
    && (!("position" in s) || position(s.position))
    && (!("deleted" in s) || typeof s.deleted === "boolean");
}

function validItemOp(op: ItemOp): boolean {
  const s = op.set;
  return text(op.listId, 64) && !!op.listId && Number.isInteger(op.appid) && op.appid > 0
    && (!("position" in s) || position(s.position))
    && (!("deleted" in s) || typeof s.deleted === "boolean");
}

/** One set of fields per game, later ops winning. */
export function mergeOps(ops: Op[]): Map<number, Partial<GameFields>> {
  const out = new Map<number, Partial<GameFields>>();
  for (const op of ops) if (op.type === "game") out.set(op.appid, { ...out.get(op.appid), ...op.set });
  return out;
}

/** One set of fields per list, later ops winning. */
export function mergeListOps(ops: Op[]): Map<string, Partial<ListFields>> {
  const out = new Map<string, Partial<ListFields>>();
  for (const op of ops) if (op.type === "list") out.set(op.listId, { ...out.get(op.listId), ...op.set });
  return out;
}

/** One set of fields per game in a list, later ops winning. */
export function mergeItemOps(ops: Op[]): { listId: string; appid: number; set: Partial<ItemFields> }[] {
  const out = new Map<string, { listId: string; appid: number; set: Partial<ItemFields> }>();
  for (const op of ops) {
    if (op.type !== "item") continue;
    const k = `${op.listId} ${op.appid}`;
    out.set(k, { listId: op.listId, appid: op.appid, set: { ...out.get(k)?.set, ...op.set } });
  }
  return [...out.values()];
}

/** One set of fields per view, later ops winning. */
export function mergeViewOps(ops: Op[]): Map<string, Partial<ViewFields>> {
  const out = new Map<string, Partial<ViewFields>>();
  for (const op of ops) if (op.type === "view") out.set(op.viewId, { ...out.get(op.viewId), ...op.set });
  return out;
}
