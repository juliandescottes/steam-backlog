import { expect, test } from "vitest";
import { builtInViews, canonical, sameView } from "./views.ts";

test("canonical drops defaults and orders statuses", () => {
  expect(canonical({ statuses: ["playing", "backlog"], played: "any", q: " ", minHours: undefined })).toEqual({ statuses: ["backlog", "playing"] });
  expect(canonical({ statuses: ["backlog", "playing", "finished", "dropped"] })).toEqual({}); // all statuses = no status filter
  expect(canonical({ maxHours: 5, needsLength: false })).toEqual({ maxHours: 5 });
});

test("views compare by what they show", () => {
  expect(sameView({ filter: { statuses: ["playing", "backlog"] }, sort: "length" }, { filter: { statuses: ["backlog", "playing"], played: "any" }, sort: "length" })).toBe(true);
  expect(sameView({ filter: {}, sort: "length" }, { filter: {}, sort: "name" })).toBe(false);
});

test("Finished in <year> follows the clock", () => {
  const v = builtInViews(new Date(2027, 5, 1)).find(v => v.id === "builtin:finished-year")!;
  expect(v.name).toBe("Finished in 2027");
  expect(v.filter.finishedAfter).toBe(new Date(2027, 0, 1).getTime());
});
