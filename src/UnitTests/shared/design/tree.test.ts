import { describe, expect, it } from "vitest";
import { markParts } from "../../../shared/design/tree";

describe("markParts", () => {
  it("cuts the value into plain and hit parts in order", () => {
    expect(markParts("card card--highlight x", [[5, 20]])).toEqual([
      { text: "card ", hit: false },
      { text: "card--highlight", hit: true },
      { text: " x", hit: false },
    ]);
  });

  it("handles hits at the start, the end and next to each other", () => {
    expect(markParts("a b", [[0, 1], [2, 3]])).toEqual([
      { text: "a", hit: true },
      { text: " ", hit: false },
      { text: "b", hit: true },
    ]);
  });

  it("returns the whole value as plain text without hits, and nothing for an empty value", () => {
    expect(markParts("card", [])).toEqual([{ text: "card", hit: false }]);
    expect(markParts("", [])).toEqual([]);
  });

  it("leaves out empty hits", () => {
    expect(markParts("ab", [[1, 1]])).toEqual([
      { text: "a", hit: false },
      { text: "b", hit: false },
    ]);
  });
});
