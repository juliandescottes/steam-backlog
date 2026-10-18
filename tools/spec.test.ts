// SPEC.md rules (**AREA-n**) must each be cited by a test title, unless marked (manual) or (planned).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const spec = readFileSync("SPEC.md", "utf8");
const rules = new Map([...spec.matchAll(/\*\*([A-Z]+-\d+)\*\*(.*)/g)].map(m => [m[1], /\((manual|planned)\)/.test(m[2])]));
const areas = new Set([...rules.keys()].map(id => id.split("-")[0]));

const testFiles = ["e2e", "shared/src", "worker/src", "tools"].flatMap(dir =>
  readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(f => /\.(test|spec)\.ts$/.test(f)).map(f => join(dir, f)));
const cited = new Map<string, string[]>();
for (const file of testFiles) {
  for (const [, title] of readFileSync(file, "utf8").matchAll(/\b(?:test|it|describe)\(\s*["'`]([^"'`]*)/g)) {
    for (const [id] of title.matchAll(/\b[A-Z]+-\d+\b/g)) {
      if (areas.has(id.split("-")[0])) cited.set(id, [...(cited.get(id) ?? []), file]);
    }
  }
}

test("every spec rule has a test", () => {
  expect([...rules].filter(([id, exempt]) => !exempt && !cited.has(id)).map(([id]) => id)).toEqual([]);
});

test("tests cite only rules that exist", () => {
  expect([...cited].filter(([id]) => !rules.has(id)).map(([id, files]) => `${id} in ${files.join(", ")}`)).toEqual([]);
});

test("rule ids are unique", () => {
  const ids = [...spec.matchAll(/\*\*([A-Z]+-\d+)\*\*/g)].map(m => m[1]);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
});
