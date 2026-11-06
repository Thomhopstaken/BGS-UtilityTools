import { describe, expect, it } from "vitest";
import { buildResultTree, countResults } from "../../ClassSearcher/results/resultTree";
import type { ClassMatch, FieldHit, SearchedDocument } from "../../ClassSearcher/search/findClassUsages";
import type { TreeNode } from "../../shared/design/tree";

const overview: SearchedDocument = { id: "p1", qualifiedName: "Sales.Order_Overview", kind: "page" };
const edit: SearchedDocument = { id: "p2", qualifiedName: "Customers.Customer_Edit", kind: "page" };
const line: SearchedDocument = { id: "s1", qualifiedName: "Sales.SNIP_Line", kind: "snippet" };

const classHit: FieldHit = { field: "class", value: "card x", ranges: [[0, 4]] };
const dynamicHit: FieldHit = { field: "dynamicClasses", value: "'card'", ranges: [[1, 5]] };

const node = (id: string) => ({ id, label: id, type: id.startsWith("container") ? "Container" : "" });

function match(document: SearchedDocument, parent: string | null, element: string | null, hits: FieldHit[] = [classHit]): ClassMatch {
  return { document, parent: parent === null ? null : node(parent), element: element === null ? null : node(element), hits };
}

// "label(count)[fields]" per node, children indented.
function outline(nodes: readonly TreeNode[], depth = 0): string[] {
  return nodes.flatMap((n) => [
    `${"  ".repeat(depth)}${n.label}(${n.count})${n.fields.map((field) => `[${field.key}]`).join("")}`,
    ...outline(n.children, depth + 1),
  ]);
}

describe("buildResultTree", () => {
  it("shows document › parent › element, one root per document sorted by name, parents merged", () => {
    const tree = buildResultTree([
      match(overview, "listOrders", "containerA"),
      match(line, null, "containerLine"),
      match(overview, "layoutGrid1", "containerB", [classHit, dynamicHit]),
      match(overview, "listOrders", "containerC"),
      match(edit, "layoutGrid2", "Row 2"),
    ]);
    expect(outline(tree)).toEqual([
      "Customers.Customer_Edit(1)",
      "  layoutGrid2(1)",
      "    Row 2(1)[Class]",
      "Sales.Order_Overview(3)",
      "  listOrders(2)",
      "    containerA(1)[Class]",
      "    containerC(1)[Class]",
      "  layoutGrid1(1)",
      "    containerB(1)[Class][Dynamic]",
      "Sales.SNIP_Line(1)",
      "  containerLine(1)[Class]",
    ]);
  });

  it("captions documents by kind and targets every row", () => {
    const [root] = buildResultTree([match(line, "outer", "containerLine")]);
    expect(root).toMatchObject({ type: "Snippet", target: { documentId: "s1" } });
    expect(root.children[0]).toMatchObject({ label: "outer", fields: [], target: { documentId: "s1", elementId: "outer" } });
    expect(root.children[0].children[0]).toMatchObject({ type: "Container", target: { documentId: "s1", elementId: "containerLine" } });
  });

  it("puts a document's own match on its root row", () => {
    const [root] = buildResultTree([match(overview, null, null), match(overview, null, "containerA")]);
    expect(outline([root])).toEqual(["Sales.Order_Overview(2)[Class]", "  containerA(1)[Class]"]);
  });

  it("shows a widget that is a result and a parent twice, as result and as parent", () => {
    const tree = buildResultTree([match(overview, null, "outer"), match(overview, "outer", "inner")]);
    expect(outline(tree)).toEqual(["Sales.Order_Overview(2)", "  outer(1)[Class]", "  outer(1)", "    inner(1)[Class]"]);
  });

  it("keeps the field values and hits", () => {
    const [root] = buildResultTree([match(overview, null, "containerA", [dynamicHit])]);
    expect(root.children[0].fields).toEqual([{ key: "Dynamic", value: "'card'", hits: [[1, 5]] }]);
  });

  it("returns no roots without matches", () => {
    expect(buildResultTree([])).toEqual([]);
  });
});

describe("countResults", () => {
  it("adds up the matching elements of every root", () => {
    const tree = buildResultTree([match(overview, null, "containerA"), match(overview, "containerA", "containerB"), match(line, null, null)]);
    expect(countResults(tree)).toBe(3);
  });
});
