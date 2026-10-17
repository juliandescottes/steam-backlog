import { describe, expect, it } from "vitest";
import { bandOf, formatHours } from "./bands.ts";
import { newGame } from "./files.ts";
import { resolveLength } from "./lengths.ts";
import type { Game } from "./types.ts";

const game = (over: Partial<Game> = {}): Game => ({ ...newGame({ appid: 10, name: "Test" }, 0), ...over });
const igdb = (main_extra: number | null, count: number) => ({ main: null, main_extra, comp: null, count });

describe("resolveLength", () => {
  it("is unknown without data", () => {
    const r = resolveLength(game(), "main_extra");
    expect(r).toMatchObject({ hours: null, source: null, endless: false });
    expect(bandOf(r).id).toBe("unknown");
  });

  it("prefers the user's own length, even over IGDB", () => {
    const r = resolveLength(game({ igdb: igdb(10, 20), my: { main: null, main_extra: 4, comp: null }, myKind: "exact" }), "main_extra");
    expect(r).toMatchObject({ hours: 4, source: "mine", approx: false });
  });

  it("marks rough guesses approximate", () => {
    const r = resolveLength(game({ my: { main: null, main_extra: 8, comp: null }, myKind: "approx" }), "main_extra");
    expect(r).toMatchObject({ hours: 8, approx: true });
  });

  it("puts endless games in the No ending band", () => {
    const r = resolveLength(game({ igdb: igdb(10, 20), myKind: "endless" }), "main_extra");
    expect(r).toMatchObject({ hours: null, endless: true });
    expect(bandOf(r).id).toBe("no-ending");
  });

  it("marks IGDB times with fewer than 3 submissions approximate", () => {
    expect(resolveLength(game({ igdb: igdb(10, 2) }), "main_extra")).toMatchObject({ hours: 10, source: "igdb", approx: true });
    expect(resolveLength(game({ igdb: igdb(10, 3) }), "main_extra")).toMatchObject({ approx: false });
  });

  it("falls back to another measure, flagged approximate", () => {
    const r = resolveLength(game({ igdb: { main: 6, main_extra: null, comp: 20, count: 10 } }), "main_extra");
    expect(r).toMatchObject({ hours: 6, approx: true });
  });

  it("uses the measure setting", () => {
    const g = game({ igdb: { main: 6, main_extra: 9, comp: 20, count: 10 } });
    expect(resolveLength(g, "main").hours).toBe(6);
    expect(resolveLength(g, "main_extra").hours).toBe(9);
  });

  it("prefers community over IGDB when it has 3+ and more entries", () => {
    const g = (count: number, igdbCount: number) =>
      resolveLength(game({ igdb: igdb(10, igdbCount), community: { main_extra: 14, count, endlessCount: 0 } }), "main_extra");
    expect(g(5, 2)).toMatchObject({ hours: 14, source: "community", approx: false });
    expect(g(5, 8)).toMatchObject({ hours: 10, source: "igdb" });
    expect(g(2, 0)).toMatchObject({ hours: 10, source: "igdb" });
  });

  it("uses a thin community value only as an approximate last resort", () => {
    const r = resolveLength(game({ community: { main_extra: 14, count: 1, endlessCount: 0 } }), "main_extra");
    expect(r).toMatchObject({ hours: 14, source: "community", approx: true });
  });

  it("follows community No ending votes when they outnumber lengths", () => {
    const r = resolveLength(game({ igdb: igdb(10, 1), community: { main_extra: 3, count: 1, endlessCount: 4 } }), "main_extra");
    expect(r.endless).toBe(true);
  });
});

describe("bands and formatting", () => {
  const band = (hours: number) => bandOf({ hours, lengths: null, source: "igdb", approx: false, endless: false }).id;
  it("places band edges in the longer band", () => {
    expect(band(2.99)).toBe("under-3");
    expect(band(3)).toBe("3-6");
    expect(band(80)).toBe("80-plus");
  });
  it("shows quarters under 3h and whole hours above", () => {
    expect(formatHours(1.8)).toBe("1.75h");
    expect(formatHours(0.05)).toBe("0.25h");
    expect(formatHours(2.9)).toBe("3h");
    expect(formatHours(3.25)).toBe("3h");
    expect(formatHours(112.75, true)).toBe("~113h");
    expect(formatHours(6, true)).toBe("~6h");
    expect(formatHours(null)).toBe("–");
  });
  it("keeps quarters everywhere when asked for precision", () => {
    expect(formatHours(12.5, false, true)).toBe("12.5h");
    expect(formatHours(112.75, true, true)).toBe("~112.75h");
  });
});
