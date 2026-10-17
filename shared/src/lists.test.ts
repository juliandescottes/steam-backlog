import { expect, test } from "vitest";
import { after, between, newShareId, SHARE_ID } from "./lists.ts";

test("between sorts strictly between its bounds", () => {
  expect(between(null, null)).toBe("i");
  const cases: [string | null, string | null][] = [[null, "1"], [null, "01"], ["i", null], ["z", null], ["zz", null], ["a", "b"], ["a", "a1"], ["az", "b"], ["0i", "1"]];
  for (const [a, b] of cases) {
    const k = between(a, b);
    if (a != null) expect(k > a).toBe(true);
    if (b != null) expect(k < b).toBe(true);
    expect(k.endsWith("0")).toBe(false);
  }
  expect(() => between("b", "a")).toThrow();
});

test("repeated inserts at the same spot keep working", () => {
  let lo = "a", hi = "b";
  for (let i = 0; i < 200; i++) {
    const k = between(lo, hi);
    expect(lo < k && k < hi).toBe(true);
    if (i % 2) lo = k; else hi = k;
  }
  let first: string | null = "i";
  for (let i = 0; i < 100; i++) {
    const k = between(null, first);
    expect(k < first!).toBe(true);
    first = k;
  }
});

test("after appends keys in order", () => {
  const keys = after("i", 5);
  expect([...keys].sort()).toEqual(keys);
  expect(keys[0] > "i").toBe(true);
});

test("share ids", () => {
  const ids = Array.from({ length: 100 }, newShareId);
  expect(ids.every(id => SHARE_ID.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(100);
});
