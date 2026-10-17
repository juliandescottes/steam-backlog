import { expect, test } from "vitest";
import { normalizeName } from "./names.ts";
import { matchScore, rank } from "./rank.ts";

test("prefix beats word start beats substring", () => {
  expect(matchScore("port", "portal 2")).toBe(3);
  expect(matchScore("life", "half life 2")).toBe(2);
  expect(matchScore("alf", "half life 2")).toBe(1);
  expect(matchScore("doom", "half life 2")).toBe(-1);
  expect(matchScore("ne", "neon nest")).toBe(3);
  expect(matchScore("est", "neon nest estate")).toBe(2); // a later word start counts
});

test("ranks by score, then shorter names; the query is normalized", () => {
  const names = ["Half-Life 2", "Portal 2", "Portal", "Life is Strange", "Unlife"];
  const top = rank("LIFE", names, normalizeName, 10);
  expect(top).toEqual(["Life is Strange", "Half-Life 2", "Unlife"]);
  expect(rank("portal", names, normalizeName, 1)).toEqual(["Portal"]);
  expect(rank("", names, normalizeName, 2)).toHaveLength(2);
});
