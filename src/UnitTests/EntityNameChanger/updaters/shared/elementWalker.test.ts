import { describe, expect, it } from "vitest";
import { isElement, walkElements } from "../../../../EntityNameChanger/updaters/shared/elementWalker";

function visitedTypes(root: object): string[] {
  const types: string[] = [];
  walkElements(root, (element) => types.push(element.$Type));
  return types;
}

describe("isElement", () => {
  it("accepts objects with a string $Type only", () => {
    expect(isElement({ $Type: "Pages$Page" })).toBe(true);
    expect(isElement({ name: "x" })).toBe(false);
    expect(isElement(null)).toBe(false);
    expect(isElement("Pages$Page")).toBe(false);
  });
});

describe("walkElements", () => {
  it("visits the root and nested elements depth-first", () => {
    const root = {
      $Type: "A",
      child: { $Type: "B", items: [{ $Type: "C" }, { $Type: "D", nested: { $Type: "E" } }] },
      other: { $Type: "F" },
    };
    expect(visitedTypes(root)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("walks through plain objects without $Type", () => {
    expect(visitedTypes({ $Type: "A", plain: { inner: { $Type: "B" } } })).toEqual(["A", "B"]);
  });

  it("skips $-prefixed keys", () => {
    expect(visitedTypes({ $Type: "A", $Container: { $Type: "Parent" } })).toEqual(["A"]);
  });

  it("visits shared and cyclic objects once", () => {
    const shared: Record<string, unknown> = { $Type: "B" };
    const root: Record<string, unknown> = { $Type: "A", first: shared, second: shared };
    shared.back = root;
    expect(visitedTypes(root)).toEqual(["A", "B"]);
  });

  it("ignores primitives and null", () => {
    expect(visitedTypes({ $Type: "A", text: "x", count: 1, none: null, list: [1, "a", null] })).toEqual(["A"]);
  });

  it("lets visit change string properties", () => {
    const root = { $Type: "A", child: { $Type: "B", expression: "$Order" } };
    walkElements(root, (element) => {
      if (element.$Type === "B") {
        element.expression = "$Purchase";
      }
    });
    expect(root.child.expression).toBe("$Purchase");
  });
});
