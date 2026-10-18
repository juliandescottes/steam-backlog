import type { SortKey } from "./filter.ts";
import type { ListKind } from "./lists.ts";
import type { Game } from "./types.ts";

/**
 * A shared list as viewers get it (GET /api/s/:shareId, TECH.md §9). Games carry lengths and the
 * owner's status, never notes, playtime or dates: those are blanked out.
 */
export type SharedList = {
  /** `handle` only when the owner's public profile is on, to link to it. */
  owner: { name: string; avatar: string | null; handle: string | null };
  list: { title: string; description: string; kind: ListKind; sort: SortKey | null };
  games: Game[];
};

/** A public profile (GET /api/u/:handle): the lists the owner chose to show, with their size. */
export type Profile = {
  handle: string;
  name: string;
  avatar: string | null;
  stats: { finished: number; hoursCleared: number };
  /** Games to play (Backlog and Playing) when the owner shows their whole backlog, else null. */
  backlog: { games: number; hours: number; covers: number[] } | null;
  lists: { shareId: string; title: string; description: string; kind: ListKind; games: number; hours: number; covers: number[] }[];
};

/** 2 to 30 lowercase letters, digits and inner dashes: the public username in /u/<handle> (profiles). */
export const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/;

/** A handle to suggest from a Steam name, or "" when nothing usable is left. */
export function suggestHandle(name: string): string {
  const h = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return HANDLE.test(h) ? h : "";
}

/** A list's address, for its owner and for viewers. */
export const sharePath = (shareId: string) => `/l/${shareId}`;
export const profilePath = (handle: string) => `/u/${handle}`;
export const backlogPath = (handle: string) => `/u/${handle}/backlog`;
