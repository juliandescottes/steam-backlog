/* Sync protocol between the client outbox and the Worker (TECH.md §5). */
import { STATUSES, type Game, type LenKind } from "./types.ts";

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
export type Op = { id: string; type: "game"; appid: number; at: number; set: Partial<GameFields> };

/** `since` is the last rev seen; `catalogSince` the last catalogAt (IGDB and community lengths change without a rev). */
export type SyncRequest = { since: number; catalogSince: number; ops: Op[] };
export type SyncResponse = { rev: number; catalogAt: number; games: Game[] };

const KINDS: LenKind[] = ["exact", "approx", "endless", "imported"];
const time = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const hours = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 100_000);

export function validOp(o: unknown): o is Op {
  if (!o || typeof o !== "object") return false;
  const op = o as Op;
  if (typeof op.id !== "string" || !op.id || op.id.length > 64 || op.type !== "game") return false;
  if (!Number.isInteger(op.appid) || op.appid <= 0 || !time(op.at) || !op.set || typeof op.set !== "object") return false;
  const s = op.set;
  return (!("status" in s) || STATUSES.includes(s.status!))
    && (!("statusAt" in s) || time(s.statusAt))
    && (!("finishedAt" in s) || time(s.finishedAt))
    && (!("note" in s) || (typeof s.note === "string" && s.note.length <= 10_000))
    && (!("myKind" in s) || s.myKind === null || KINDS.includes(s.myKind!))
    && (!("my" in s) || s.my === null || (typeof s.my === "object" && hours(s.my.main) && hours(s.my.main_extra) && hours(s.my.comp)));
}

/** One set of fields per game, later ops winning. */
export function mergeOps(ops: Op[]): Map<number, Partial<GameFields>> {
  const out = new Map<number, Partial<GameFields>>();
  for (const op of ops) out.set(op.appid, { ...out.get(op.appid), ...op.set });
  return out;
}
