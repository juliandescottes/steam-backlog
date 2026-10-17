import { expect, test } from "vitest";
import { move } from "./grid.ts";

// Two shelves, 3 columns:  1 2 3   |  10 11
//                          4 5     |
const shelves = [[1, 2, 3, 4, 5], [10, 11]];

test("left and right follow reading order across shelves", () => {
  expect(move(shelves, 3, 2, "right")).toBe(3);
  expect(move(shelves, 3, 3, "right")).toBe(4);
  expect(move(shelves, 3, 5, "right")).toBe(10);
  expect(move(shelves, 3, 10, "left")).toBe(5);
  expect(move(shelves, 3, 1, "left")).toBe(1);
  expect(move(shelves, 3, 11, "right")).toBe(11);
});

test("up and down keep the column, across shelves", () => {
  expect(move(shelves, 3, 2, "down")).toBe(5);
  expect(move(shelves, 3, 3, "down")).toBe(5); // partial row below: its last card
  expect(move(shelves, 3, 5, "down")).toBe(11);
  expect(move(shelves, 3, 4, "down")).toBe(10);
  expect(move(shelves, 3, 11, "up")).toBe(5);
  expect(move(shelves, 3, 10, "up")).toBe(4);
  expect(move(shelves, 3, 5, "up")).toBe(2);
  expect(move(shelves, 3, 2, "up")).toBe(2);
  expect(move(shelves, 3, 11, "down")).toBe(11);
});

test("empty shelves are skipped; unknown ids stay", () => {
  expect(move([[1], [], [2]], 3, 1, "down")).toBe(2);
  expect(move([[1], [], [2]], 3, 2, "left")).toBe(1);
  expect(move(shelves, 3, 99, "down")).toBe(99);
});
