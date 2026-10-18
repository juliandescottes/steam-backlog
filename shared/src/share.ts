import type { SortKey } from "./filter.ts";
import type { ListKind } from "./lists.ts";
import type { Game } from "./types.ts";

/**
 * A shared list as viewers get it (GET /api/s/:shareId, TECH.md §9). Games carry lengths and the
 * owner's status, never notes, playtime or dates: those are blanked out.
 */
export type SharedList = {
  /** `profileId` only when the owner's public profile is on, to link to it. */
  owner: { name: string; avatar: string | null; profileId: string | null };
  list: { title: string; description: string; kind: ListKind; sort: SortKey | null };
  games: Game[];
};

/** A public profile (GET /api/u/:profileId): the lists the owner chose to show, with their size. */
export type Profile = {
  id: string;
  name: string;
  avatar: string | null;
  stats: { finished: number; hoursCleared: number };
  /** Games to play (Backlog and Playing) when the owner shows their whole backlog, else null. */
  backlog: { games: number; hours: number; covers: number[] } | null;
  lists: { shareId: string; title: string; description: string; kind: ListKind; games: number; hours: number; covers: number[] }[];
};

/** A list's address, for its owner and for viewers. */
export const sharePath = (shareId: string) => `/l/${shareId}`;
export const profilePath = (id: string) => `/u/${id}`;
export const backlogPath = (id: string) => `/u/${id}/backlog`;
