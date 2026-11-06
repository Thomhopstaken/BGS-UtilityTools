import { describe, expect, it } from "vitest";
import type { RowTarget } from "../../../shared/design/runLog";
import type { TreeNode } from "../../../shared/design/tree";
import { TreeView } from "../../../shared/design/TreeView";
import { FakeElement, type FakeNode, fakeDocument, textOf } from "./fakeDom";

function node(label: string, props: Partial<TreeNode> = {}): TreeNode {
  return { label, type: "", target: { documentId: "doc-1", elementId: label }, fields: [], children: [], count: 0, ...props };
}

const leaf = node("containerSummary", {
  type: "Container",
  count: 1,
  fields: [{ key: "Class", value: "card card--highlight", hits: [[5, 20]] }],
});
const page = node("Sales.Order_Overview", { type: "Page", target: { documentId: "doc-1" }, count: 1, children: [node("Main", { type: "Placeholder", count: 1, children: [leaf] })] });

function setup(nodes: TreeNode[] = [page]) {
  const list = fakeDocument().createElement("ul");
  const view = new TreeView(list as unknown as HTMLElement);
  const opened: RowTarget[] = [];
  view.onOpen((target) => opened.push(target));
  view.show(nodes);
  return { list, view, opened };
}

const el = (n: FakeNode | undefined) => n as FakeElement;
const childrenOf = (n: FakeNode | undefined) => el(n).children as FakeElement[];
const byClass = (n: FakeElement, name: string) => (n.children as FakeElement[]).find((c) => c.className.split(" ").includes(name));
const rowOf = (item: FakeElement) => item.children[0] as FakeElement;
const groupOf = (item: FakeElement) => byClass(item, "bgs-tree__group") as FakeElement;

describe("TreeView.show", () => {
  it("renders a root row with a chevron, the label, the type and the count", () => {
    const { list } = setup();
    const [item] = childrenOf(list);
    const row = rowOf(item);
    expect(row.className).toBe("bgs-tree__row bgs-tree__row--root");
    expect(childrenOf(row).map((c) => [c.className, c.textContent])).toEqual([
      ["bgs-tree__toggle", null],
      ["bgs-tree__label", "Sales.Order_Overview"],
      ["bgs-tree__type", "Page"],
      ["bgs-tree__n", "1"],
    ]);
    expect(byClass(row, "bgs-tree__n")?.title).toBe("1 result");
    expect(byClass(row, "bgs-tree__label")?.title).toBe("Open in Studio Pro");
  });

  it("starts every level open", () => {
    const { list } = setup();
    const [item] = childrenOf(list);
    const toggle = byClass(rowOf(item), "bgs-tree__toggle") as FakeElement;
    expect(toggle.attributes.get("aria-expanded")).toBe("true");
    expect(toggle.attributes.get("aria-label")).toBe("Collapse Sales.Order_Overview");
    expect(groupOf(item).hidden).toBe(false);
  });

  it("renders a result leaf with a spacer, no count, and its fields with the hit marked", () => {
    const { list } = setup();
    const main = childrenOf(groupOf(childrenOf(list)[0]))[0];
    const item = childrenOf(groupOf(main))[0];
    const row = rowOf(item);
    expect(row.className).toBe("bgs-tree__row bgs-tree__row--match");
    expect(childrenOf(row).map((c) => c.className)).toEqual(["bgs-tree__spacer", "bgs-tree__label", "bgs-tree__type"]);
    const field = childrenOf(byClass(item, "bgs-tree__fields"))[0];
    const [key, value] = childrenOf(field);
    expect(key.textContent).toBe("Class");
    expect(value.children).toEqual([{ text: "card " }, expect.objectContaining({ tag: "mark", className: "bgs-hit", textContent: "card--highlight" })]);
    expect(textOf(value)).toBe("card card--highlight");
  });

  it("leaves out the type when there is none", () => {
    const { list } = setup([node("Row 2", { fields: leaf.fields, count: 1 })]);
    expect(childrenOf(rowOf(childrenOf(list)[0])).map((c) => c.className)).toEqual(["bgs-tree__spacer", "bgs-tree__label", "bgs-tree__n"]);
  });

  it("replaces the previous rows", () => {
    const { list, view } = setup();
    view.show([]);
    expect(list.children).toEqual([]);
  });
});

describe("TreeView folding", () => {
  it("folds and unfolds a level with its chevron", () => {
    const { list } = setup();
    const [item] = childrenOf(list);
    const toggle = byClass(rowOf(item), "bgs-tree__toggle") as FakeElement;
    toggle.dispatch("click");
    expect(groupOf(item).hidden).toBe(true);
    expect(toggle.attributes.get("aria-expanded")).toBe("false");
    expect(toggle.attributes.get("aria-label")).toBe("Expand Sales.Order_Overview");
    toggle.dispatch("click");
    expect(groupOf(item).hidden).toBe(false);
  });

  // page > Main > grid > leaf, as tree items.
  function deepTree() {
    const deep = node("Sales.Deep", { type: "Page", target: { documentId: "doc-2" }, count: 1, children: [node("Main", { count: 1, children: [node("grid", { count: 1, children: [leaf] })] })] });
    const { list } = setup([deep]);
    const root = childrenOf(list)[0];
    const main = childrenOf(groupOf(root))[0];
    const grid = childrenOf(groupOf(main))[0];
    return { root, main, grid };
  }
  const toggleOf = (item: FakeElement) => byClass(rowOf(item), "bgs-tree__toggle") as FakeElement;

  it("opens the whole structure below a root row with its chevron", () => {
    const { root, main, grid } = deepTree();
    for (const item of [grid, main, root]) {
      toggleOf(item).dispatch("click");
    }
    toggleOf(root).dispatch("click");
    expect([root, main, grid].map((item) => groupOf(item).hidden)).toEqual([false, false, false]);
    expect([root, main, grid].map((item) => toggleOf(item).attributes.get("aria-expanded"))).toEqual(["true", "true", "true"]);
  });

  it("closes only the root row with its chevron", () => {
    const { root, main, grid } = deepTree();
    toggleOf(root).dispatch("click");
    expect([root, main, grid].map((item) => groupOf(item).hidden)).toEqual([true, false, false]);
  });

  it("opens one level with a deeper chevron", () => {
    const { main, grid } = deepTree();
    toggleOf(grid).dispatch("click");
    toggleOf(main).dispatch("click");
    toggleOf(main).dispatch("click");
    expect([main, grid].map((item) => groupOf(item).hidden)).toEqual([false, true]);
  });

  it("collapses and expands every level", () => {
    const { list, view } = setup();
    const [item] = childrenOf(list);
    const main = childrenOf(groupOf(item))[0];
    view.collapseAll();
    expect([groupOf(item).hidden, groupOf(main).hidden]).toEqual([true, true]);
    view.expandAll();
    expect([groupOf(item).hidden, groupOf(main).hidden]).toEqual([false, false]);
  });
});

describe("TreeView.onOpen", () => {
  it("passes the clicked row's target", () => {
    const { list, opened } = setup();
    const [item] = childrenOf(list);
    byClass(rowOf(item), "bgs-tree__label")?.dispatch("click");
    const main = childrenOf(groupOf(item))[0];
    byClass(rowOf(childrenOf(groupOf(main))[0]), "bgs-tree__label")?.dispatch("click");
    expect(opened).toEqual([{ documentId: "doc-1" }, { documentId: "doc-1", elementId: "containerSummary" }]);
  });
});
