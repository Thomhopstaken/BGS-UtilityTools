import { describe, expect, it } from "vitest";
import { isElement, walkElements, walkElementsWithPath } from "../../../../shared/rename/rewrite/elementWalker";

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

describe("walkElementsWithPath", () => {
  // "type@key[index] < parent types", one entry per visit.
  function visits(root: object): string[] {
    const seen: string[] = [];
    walkElementsWithPath(root, (place, ancestors) => {
      const at = place.index === undefined ? place.key : `${place.key}[${place.index}]`;
      seen.push(`${place.element.$Type}@${at} < ${ancestors.map((a) => a.element.$Type).join(",")}`);
    });
    return seen;
  }

  it("passes each element's property, array position and ancestors, root first", () => {
    const root = {
      $Type: "Page",
      rows: [{ $Type: "Row", columns: [{ $Type: "Column" }, { $Type: "Column", widgets: [{ $Type: "Container" }] }] }],
      appearance: { $Type: "Appearance" },
    };
    expect(visits(root)).toEqual([
      "Page@ < ",
      "Row@rows[0] < Page",
      "Column@columns[0] < Page,Row",
      "Column@columns[1] < Page,Row",
      "Container@widgets[0] < Page,Row,Column",
      "Appearance@appearance < Page",
    ]);
  });

  it("names the property of the nearest object through plain objects without $Type", () => {
    expect(visits({ $Type: "A", plain: { inner: { $Type: "B" } } })).toEqual(["A@ < ", "B@inner < A"]);
  });

  it("skips $-prefixed keys and visits shared objects once", () => {
    const shared = { $Type: "B" };
    expect(visits({ $Type: "A", $Container: { $Type: "Parent" }, first: shared, second: shared })).toEqual(["A@ < ", "B@first < A"]);
  });

  it("reuses the ancestors array, so a kept copy stays as it was", () => {
    const kept: string[][] = [];
    walkElementsWithPath({ $Type: "A", child: { $Type: "B", leaf: { $Type: "C" } } }, (_place, ancestors) => {
      kept.push([...ancestors].map((a) => a.element.$Type));
    });
    expect(kept).toEqual([[], ["A"], ["A", "B"]]);
  });
});
