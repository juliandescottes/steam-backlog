import type { SortKey } from "./filter.ts";
import type { ListKind } from "./lists.ts";
import type { Game } from "./types.ts";

/**
 * A shared list as viewers get it (GET /api/u/:handle/l/:slug, TECH.md §9). Games carry lengths and the
 * owner's status, never notes, playtime or dates: those are blanked out.
 */
export type SharedList = {
  owner: { handle: string; name: string; avatar: string | null };
  list: { title: string; description: string; kind: ListKind; sort: SortKey | null };
  games: Game[];
};

/** 2 to 30 lowercase letters, digits and inner dashes: the name in /u/<handle>. */
export const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/;

/** A handle to suggest from a Steam name, or "" when nothing usable is left. */
export function suggestHandle(name: string): string {
  const h = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return HANDLE.test(h) ? h : "";
}

export const sharePath = (handle: string, slug: string) => `/u/${handle}/l/${encodeURIComponent(slug)}`;
