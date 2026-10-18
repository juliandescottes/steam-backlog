/*
 * File formats the app reads and writes:
 * - backlog-library: a game library (what Steam import + IGDB will provide in milestone 3; made by tools/make_library.ts for now)
 * - backlog-export: a backup of the user's own data
 */
import { roundHours } from "./bands.ts";
import { newShareId, type List, type ListItem } from "./lists.ts";
import { decodeEntities } from "./names.ts";
import { validOp } from "./sync.ts";
import { STATUSES, type Game, type LenKind, type Lengths, type Status } from "./types.ts";
import type { View } from "./views.ts";

export type LibraryGame = {
  appid: number;
  name: string;
  playtimeMin?: number;
  lastPlayedAt?: number | null;
  addedAt?: number;
  igdb?: (Lengths & { count: number | null }) | null;
};
export type LibraryFile = { format: "backlog-library"; version: 1; games: LibraryGame[] };

export type ExportGame = Pick<Game, "appid" | "name" | "status" | "statusAt" | "finishedAt" | "note" | "my" | "myKind" | "playtimeMin" | "addedAt">;
export type ExportFile = {
  format: "backlog-export";
  version: 1;
  exportedAt: string;
  settings?: Record<string, unknown>;
  games: ExportGame[];
  views?: View[];
  lists?: List[];
  listItems?: ListItem[];
};

export class FileFormatError extends Error {}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const hours = (v: unknown) => { const n = num(v); return n == null ? null : roundHours(n); };
const appidOf = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new FileFormatError(`Invalid Steam app ID: ${String(v)}`);
  return n;
};

function json(text: string): any {
  try { return JSON.parse(text); } catch { throw new FileFormatError("Not a JSON file"); }
}

export function newGame(l: LibraryGame, now: number): Game {
  return {
    appid: l.appid, name: l.name, portrait: null,
    playtimeMin: l.playtimeMin ?? 0, lastPlayedAt: l.lastPlayedAt ?? null, addedAt: l.addedAt ?? now,
    igdb: l.igdb ?? null, community: null,
    status: "backlog", statusAt: null, finishedAt: null, note: "", my: null, myKind: null,
  };
}

export function parseLibrary(text: string): LibraryGame[] {
  const d = json(text);
  if (d?.format !== "backlog-library" || d.version !== 1 || !Array.isArray(d.games)) {
    throw new FileFormatError("Not a backlog library file (expected format \"backlog-library\", version 1)");
  }
  return d.games.map((g: any): LibraryGame => ({
    appid: appidOf(g.appid),
    name: decodeEntities(String(g.name ?? `Steam app ${g.appid}`)),
    playtimeMin: num(g.playtimeMin) ?? 0,
    lastPlayedAt: num(g.lastPlayedAt),
    addedAt: num(g.addedAt) ?? undefined,
    igdb: g.igdb ? { main: hours(g.igdb.main), main_extra: hours(g.igdb.main_extra), comp: hours(g.igdb.comp), count: num(g.igdb.count) } : null,
  }));
}

/** Rows of a CSV with a header line; column names are lowercased. */
export function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const cols = splitCsv(head ?? "").map(c => c.trim().toLowerCase());
  if (!cols.includes("appid") && !cols.includes("steam_appid")) throw new FileFormatError("CSV needs an appid column");
  return lines.map(l => Object.fromEntries(splitCsv(l).map((v, i) => [cols[i], v])));
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

type Mine = { views?: View[]; lists?: List[]; listItems?: ListItem[] };

export function makeExport(games: Game[], settings: Record<string, unknown>, mine: Mine = {}, now = new Date()): ExportFile {
  return {
    format: "backlog-export", version: 1, exportedAt: now.toISOString(), settings, ...mine,
    games: games.map(g => ({
      appid: g.appid, name: g.name, status: g.status, statusAt: g.statusAt, finishedAt: g.finishedAt,
      note: g.note, my: g.my, myKind: g.myKind, playtimeMin: g.playtimeMin, addedAt: g.addedAt,
    })),
  };
}

const KINDS: LenKind[] = ["exact", "approx", "endless", "imported"];

export function parseExport(text: string): ExportFile {
  const d = json(text);
  if (d?.format !== "backlog-export" || d.version !== 1 || !Array.isArray(d.games)) {
    throw new FileFormatError("Not a backlog backup (expected format \"backlog-export\", version 1)");
  }
  const games = d.games.map((g: any): ExportGame => ({
    appid: appidOf(g.appid),
    name: String(g.name ?? `Steam app ${g.appid}`),
    status: STATUSES.includes(g.status) ? (g.status as Status) : "backlog",
    statusAt: num(g.statusAt), finishedAt: num(g.finishedAt),
    note: typeof g.note === "string" ? g.note : "",
    my: g.my ? { main: hours(g.my.main), main_extra: hours(g.my.main_extra), comp: hours(g.my.comp) } : null,
    myKind: KINDS.includes(g.myKind) ? g.myKind : null,
    playtimeMin: num(g.playtimeMin) ?? 0,
    addedAt: num(g.addedAt) ?? Date.now(),
  }));
  // Views, lists and items are checked like sync ops, plus the fields a new one needs
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v.filter(x => x && typeof x === "object") : []);
  const views: View[] = arr(d.views).filter(({ id, ...set }) =>
    set.name && set.filter && set.sort && typeof set.position === "string" && validOp({ id: "x", type: "view", viewId: id, at: 0, set }))
    .map(({ id, name, filter, sort, position }) => ({ id, name, filter, sort, position }));
  const lists: List[] = arr(d.lists).filter(({ id, ...set }) =>
    set.title && set.kind && set.position && validOp({ id: "x", type: "list", listId: id, at: 0, set: { ...set, slug: undefined } }))
    .map(({ id, title, description = "", kind, filter = null, sort = null, shareId = newShareId(), visibility = "private", position }) =>
      ({ id, title, description, kind, filter, sort, shareId, visibility, position }));
  const ids = new Set(lists.map(l => l.id));
  const listItems: ListItem[] = arr(d.listItems).filter(i =>
    ids.has(i.listId) && i.position && validOp({ id: "x", type: "item", listId: i.listId, appid: i.appid, at: 0, set: { position: i.position } }))
    .map(({ listId, appid, position }) => ({ listId, appid, position }));
  return { ...d, games, views, lists, listItems };
}
