import { describe, expect, it } from "vitest";
import { FileFormatError, makeExport, newGame, parseExport, parseLibrary } from "./files.ts";
import { compare, matches, type Entry } from "./filter.ts";
import { resolveLength } from "./lengths.ts";
import { decodeEntities, normalizeName } from "./names.ts";

describe("library file", () => {
  it("parses games and decodes entities in names", () => {
    const games = parseLibrary(JSON.stringify({
      format: "backlog-library", version: 1,
      games: [{ appid: 1, name: "Command &amp; Conquer", igdb: { main: 10, main_extra: 12.3, comp: null, count: 4 } }],
    }));
    expect(games[0]).toMatchObject({ appid: 1, name: "Command & Conquer", playtimeMin: 0, igdb: { main_extra: 12.25, count: 4 } });
  });
  it("rejects other JSON", () => {
    expect(() => parseLibrary("{}")).toThrow(FileFormatError);
    expect(() => parseLibrary("nope")).toThrow(FileFormatError);
  });
});

describe("DATA-1: export", () => {
  it("round-trips the user's fields", () => {
    const g = { ...newGame({ appid: 7, name: "Seven" }, 1000), status: "finished" as const, finishedAt: 2000, note: "great",
      my: { main: null, main_extra: 3, comp: null }, myKind: "exact" as const, triageDeclined: true };
    const back = parseExport(JSON.stringify(makeExport([g], { theme: "dark" })));
    expect(back.games[0]).toEqual({ appid: 7, name: "Seven", status: "finished", statusAt: null, finishedAt: 2000, note: "great",
      my: { main: null, main_extra: 3, comp: null }, myKind: "exact", triageDeclined: true, playtimeMin: 0, addedAt: 1000 });
    expect(back.settings).toEqual({ theme: "dark" });
    expect(back.lists).toEqual([]);
  });

  it("round-trips views, lists and their games, dropping invalid ones", () => {
    const view = { id: "v", name: "Short", filter: { maxHours: 5 }, sort: "length" as const, position: "a" };
    const list = { id: "l", title: "Up next", description: "", kind: "manual" as const, filter: null, sort: null, shareId: "abcdefghijkl", visibility: "private" as const, position: "i" };
    const file = makeExport([], {}, { views: [view], lists: [list], listItems: [{ listId: "l", appid: 7, position: "i" }] });
    const back = parseExport(JSON.stringify({
      ...file,
      views: [...file.views!, { ...view, id: "v2", sort: "nope" }],
      lists: [...file.lists!, { ...list, id: "l2", visibility: "public" }, { id: "l3", title: "No kind" }],
      listItems: [...file.listItems!, { listId: "l2", appid: 7, position: "i" }, { listId: "l", appid: -1, position: "j" }],
    }));
    expect(back.views).toEqual([view]);
    expect(back.lists).toEqual([list]);
    expect(back.listItems).toEqual([{ listId: "l", appid: 7, position: "i" }]);
  });
});

describe("names", () => {
  it("decodes entities", () => expect(decodeEntities("A &amp; B &#39;x&#x27; &bogus;")).toBe("A & B 'x' &bogus;"));
  it("normalizes for search", () => expect(normalizeName("Pokémon™: Édition — GOTY")).toBe("pokemon edition goty"));
});

describe("FIND-1 FIND-2 FIND-5: filter and sort", () => {
  const entry = (appid: number, name: string, hours: number | null, over = {}): Entry => {
    const game = { ...newGame({ appid, name, igdb: hours == null ? null : { main: null, main_extra: hours, comp: null, count: 9 } }, appid), ...over };
    return { game, len: resolveLength(game, "main_extra"), key: normalizeName(name) };
  };
  const all = [entry(1, "Beta", 10), entry(2, "Alpha", null), entry(3, "Gamma", 2, { status: "finished", playtimeMin: 90 }), entry(4, "Delta", 10)];

  it("sorts by length with unknown last and names breaking ties", () => {
    expect([...all].sort(compare("length")).map(e => e.game.name)).toEqual(["Gamma", "Beta", "Delta", "Alpha"]);
  });
  it("filters by status, search, played and missing length", () => {
    const names = (f: Parameters<typeof matches>[1]) => all.filter(e => matches(e, f)).map(e => e.game.name);
    expect(names({ statuses: ["backlog"] })).toEqual(["Beta", "Alpha", "Delta"]);
    expect(names({ q: "ALP" })).toEqual(["Alpha"]);
    expect(names({ played: "played" })).toEqual(["Gamma"]);
    expect(names({ needsLength: true })).toEqual(["Alpha"]);
    expect(names({ maxHours: 5 })).toEqual(["Gamma"]);
  });
});
