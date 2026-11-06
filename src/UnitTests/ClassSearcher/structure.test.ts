import { describe, expect, it } from "vitest";
import { elementNode, hasAppearance, isNamedWidget, parentNode, typeCaption, typeInWords } from "../../ClassSearcher/search/structure";
import type { ElementPlace, ModelElement } from "../../shared/rename/rewrite/elementWalker";
import { element } from "../NameChanger/helpers/pageBuilders";
import { appearance, container, dataGrid2, gridColumn, gridRow, layoutGrid, styledPage, tabPage } from "./helpers/classBuilders";

const place = (el: Record<string, unknown>, key = "widgets", index?: number): ElementPlace => ({ element: el as ModelElement, key, index });

describe("typeInWords", () => {
  it("writes the $Type after the namespace in words", () => {
    expect(typeInWords("Pages$GridActionButton")).toBe("Grid action button");
    expect(typeInWords("Pages$Table")).toBe("Table");
  });
});

describe("typeCaption", () => {
  it("uses Studio Pro's name for known types", () => {
    expect(typeCaption(container("c1") as ModelElement)).toBe("Container");
  });

  it("uses a pluggable widget's own name", () => {
    expect(typeCaption(dataGrid2("grid", []) as ModelElement)).toBe("Data grid 2");
    expect(typeCaption(element("CustomWidgets$CustomWidget", { type: null }) as ModelElement)).toBe("Pluggable widget");
  });

  it("falls back to the $Type in words", () => {
    expect(typeCaption(element("Pages$GridActionButton") as ModelElement)).toBe("Grid action button");
  });
});

describe("hasAppearance", () => {
  it("is true only for elements with an appearance object", () => {
    expect(hasAppearance(container("c1") as ModelElement)).toBe(true);
    expect(hasAppearance(element("Pages$TabPage") as ModelElement)).toBe(false);
    expect(hasAppearance(element("Pages$Thing", { appearance: null }) as ModelElement)).toBe(false);
  });
});

describe("isNamedWidget", () => {
  it("is true for widgets with a Class field and a name", () => {
    expect(isNamedWidget(container("c1") as ModelElement)).toBe(true);
    expect(isNamedWidget(dataGrid2("grid", []) as ModelElement)).toBe(true);
  });

  it("is false for rows, columns, placeholders, tab pages and pluggable widget slots", () => {
    const notWidgets = [
      gridRow([]),
      gridColumn([]),
      element("Pages$LayoutCallArgument", { parameter: "Main", widgets: [] }),
      tabPage("tabDetails", []),
      element("CustomWidgets$WidgetProperty", { type: "content", value: null }),
      element("Pages$DivContainer", { name: "", appearance: appearance() }),
    ];
    for (const el of notWidgets) {
      expect(isNamedWidget(el as ModelElement)).toBe(false);
    }
  });
});

describe("elementNode", () => {
  it("labels a named widget with its name and type", () => {
    const c1 = container("containerSummary");
    expect(elementNode(place(c1))).toEqual({ id: c1.$ID, label: "containerSummary", type: "Container" });
  });

  it("labels an unnamed element by its type", () => {
    const column = element("Pages$GridColumn", { name: "", appearance: appearance() });
    expect(elementNode(place(column, "columns", 0))).toMatchObject({ label: "Column", type: "" });
  });

  it("labels layout grid rows and columns, table rows and cells and navigation items by position", () => {
    const cases: [string, string][] = [
      ["Pages$LayoutGridRow", "Row 2"],
      ["Pages$LayoutGridColumn", "Column 2"],
      ["Pages$TableRow", "Row 2"],
      ["Pages$TableCell", "Cell 2"],
      ["Pages$NavigationListItem", "Item 2"],
    ];
    for (const [type, label] of cases) {
      expect(elementNode(place(element(type, { appearance: appearance() }), "items", 1))).toMatchObject({ label, type: "" });
    }
  });

  it("labels a scroll container region by its side", () => {
    expect(elementNode(place(element("Pages$ScrollContainerRegion", { appearance: appearance() }), "left"))).toMatchObject({ label: "Left region" });
  });
});

describe("parentNode", () => {
  it("is the nearest named widget, skipping rows, columns and placeholders", () => {
    const grid = layoutGrid("layoutGrid1", []);
    const ancestors = [
      place(styledPage([]), ""),
      place(element("Pages$LayoutCallArgument", { parameter: "Main" }), "arguments", 0),
      place(grid, "widgets", 0),
      place(gridRow([]), "rows", 0),
      place(gridColumn([]), "columns", 1),
    ];
    expect(parentNode(ancestors)).toEqual({ id: grid.$ID, label: "layoutGrid1", type: "Layout grid" });
  });

  it("is null when only the document and unnamed levels are above", () => {
    const ancestors = [place(styledPage([]), ""), place(element("Pages$LayoutCallArgument", { parameter: "Main" }), "arguments", 0)];
    expect(parentNode(ancestors)).toBeNull();
  });

  it("never picks the document, though a page has a name and a Class field", () => {
    expect(parentNode([place(styledPage([]), "")])).toBeNull();
  });
});
