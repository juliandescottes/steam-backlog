export type Status = "backlog" | "playing" | "finished" | "dropped";
export const STATUSES: Status[] = ["backlog", "playing", "finished", "dropped"];
export const STATUS_LABEL: Record<Status, string> = { backlog: "Backlog", playing: "Playing", finished: "Finished", dropped: "Dropped" };

/** Which length the app sorts and totals by (SPEC §9). */
export type Measure = "main" | "main_extra";

export type Lengths = { main: number | null; main_extra: number | null; comp: number | null };

/**
 * How a length the user entered should be read: an exact time, a rough band guess, a game with no ending,
 * or exact times from a lengths file (not shared with the community).
 */
export type LenKind = "exact" | "approx" | "endless" | "imported";

/** One game as the client holds it: catalog fields plus the user's own fields. */
export type Game = {
  appid: number;
  name: string;
  /** Whether Steam has portrait box art; null until the first image load tells us. */
  portrait: boolean | null;
  playtimeMin: number;
  lastPlayedAt: number | null;
  addedAt: number;
  igdb: (Lengths & { count: number | null }) | null;
  community: { main_extra: number | null; count: number; endlessCount: number } | null;

  status: Status;
  statusAt: number | null;
  finishedAt: number | null;
  note: string;
  my: Lengths | null;
  myKind: LenKind | null;
  /** Said no to marking it Finished from its playtime (ONB-5); missing on games stored before. */
  triageDeclined?: boolean;
};
