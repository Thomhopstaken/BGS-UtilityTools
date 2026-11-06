import { describe, expect, it } from "vitest";
import { classRanges, expressionRanges, stringLiterals } from "../../ClassSearcher/search/classTokens";

describe("classRanges", () => {
  it("finds the class among space-separated classes", () => {
    expect(classRanges("card card--highlight", "card--highlight")).toEqual([[5, 20]]);
  });

  it("matches whole classes only, with exact case", () => {
    expect(classRanges("card--big mycard Card", "card")).toEqual([]);
  });

  it("finds every occurrence and splits on any whitespace", () => {
    expect(classRanges("card\n  x\tcard", "card")).toEqual([
      [0, 4],
      [9, 13],
    ]);
  });

  it("shifts the ranges by the offset", () => {
    expect(classRanges("a card", "card", 10)).toEqual([[12, 16]]);
  });

  it("finds nothing in an empty field", () => {
    expect(classRanges("", "card")).toEqual([]);
  });
});

describe("stringLiterals", () => {
  it("returns the contents of each literal without the quotes", () => {
    const expression = "if $x then 'a b' else ''";
    expect(stringLiterals(expression).map(([s, e]) => expression.slice(s, e))).toEqual(["a b", ""]);
  });

  it("reads '' and \\' as escaped quotes inside a literal", () => {
    const expression = "'it''s card' + 'x\\'s card'";
    expect(stringLiterals(expression).map(([s, e]) => expression.slice(s, e))).toEqual(["it''s card", "x\\'s card"]);
  });

  it("runs an unclosed literal to the end", () => {
    const expression = "'card";
    expect(stringLiterals(expression).map(([s, e]) => expression.slice(s, e))).toEqual(["card"]);
  });

  it("finds none without quotes", () => {
    expect(stringLiterals("$currentObject/Class")).toEqual([]);
  });
});

describe("expressionRanges", () => {
  it("finds the class inside the literals of an if/else", () => {
    const expression = "if $currentObject/IsUrgent then 'card--highlight card--urgent' else ''";
    expect(expressionRanges(expression, "card--highlight")).toEqual([[33, 48]]);
  });

  it("ignores text outside the literals, such as attribute names", () => {
    expect(expressionRanges("if $card then 'x' else 'y'", "card")).toEqual([]);
  });

  it("can't find a class built from parts", () => {
    expect(expressionRanges("'card--' + $Status", "card--active")).toEqual([]);
  });

  it("finds the class in every literal", () => {
    expect(expressionRanges("if $a then 'card' else 'card big'", "card")).toEqual([
      [12, 16],
      [24, 28],
    ]);
  });
});
