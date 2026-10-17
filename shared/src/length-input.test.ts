import { describe, expect, it } from "vitest";
import { parseLengthInput } from "./length-input.ts";

const single = (s: string) => {
  const r = parseLengthInput(s);
  return r?.kind === "single" ? r.hours : r;
};

describe("parseLengthInput", () => {
  it.each([
    ["12", 12], ["12.5", 12.5], ["12,5", 12.5], ["12½", 12.5], ["½", 0.5], ["12 ¼", 12.25],
    ["12h30", 12.5], ["12:45", 12.75], ["12 h", 12], ["3 hours", 3], ["45m", 0.75], ["45 mins", 0.75],
    ["1.1", 1], ["0.1", 0.25], ["  7  ", 7],
  ])("reads %j as %d h", (input, hours) => {
    expect(single(input)).toBe(hours);
  });

  it.each(["", "abc", "12 parsecs", "0", "-3", "12:3:4"])("rejects %j", input => {
    expect(parseLengthInput(input)).toBeNull();
  });

  it("reads a pasted times block", () => {
    expect(parseLengthInput("Main Story 8 Hours Main + Extras 12½ Hours Completionist 20 Hours")).toEqual({
      kind: "block", lengths: { main: 8, main_extra: 12.5, comp: 20 },
    });
  });

  it("reads a multi-line block with Main + Sides, minutes and missing values", () => {
    const text = "Main Story\n45 Mins\n\nMain + Sides\n1¼ Hours\n\nCompletionist\n--";
    expect(parseLengthInput(text)).toEqual({ kind: "block", lengths: { main: 0.75, main_extra: 1.25, comp: null } });
  });

  it("rejects a block without any time", () => {
    expect(parseLengthInput("Main Story -- Main + Extras -- Completionist --")).toBeNull();
  });
});
