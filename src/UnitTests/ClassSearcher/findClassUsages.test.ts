import { describe, expect, it } from "vitest";
import { appearanceHits, findClassUsages, type SearchedDocument } from "../../ClassSearcher/search/findClassUsages";
import type { ModelElement } from "../../shared/rename/rewrite/elementWalker";
import { element, snippet } from "../NameChanger/helpers/pageBuilders";
import {
  appearance,
  buildingBlock,
  container,
  dataGrid2,
  gridColumn,
  gridRow,
  layout,
  layoutGrid,
  pageTemplate,
  styledPage,
  tabContainer,
  tabPage,
} from "./helpers/classBuilders";

const doc: SearchedDocument = { id: "doc-1", qualifiedName: "Sales.Order_Overview", kind: "page" };

// "parent > element" per match; "(document)" for the document's own Class field.
function results(unit: object, className: string): string[] {
  return findClassUsages(unit, doc, className).map(({ parent, element: el }) =>
    el === null ? "(document)" : [parent?.label, el.label].filter((label) => label !== undefined).join(" > "),
  );
}

describe("appearanceHits", () => {
  it("returns the Class and Dynamic classes fields that hold the class", () => {
    const el = { $Type: "Pages$DivContainer", appearance: appearance("card x", "if $a then 'card' else ''") } as ModelElement;
    expect(appearanceHits(el, "card")).toEqual([
      { field: "class", value: "card x", ranges: [[0, 4]] },
      { field: "dynamicClasses", value: "if $a then 'card' else ''", ranges: [[12, 16]] },
    ]);
  });

  it("returns nothing without an appearance, or for a null Dynamic classes field", () => {
    expect(appearanceHits({ $Type: "Pages$TabPage" } as ModelElement, "card")).toEqual([]);
    expect(appearanceHits({ $Type: "X", appearance: appearance("x", null) } as ModelElement, "card")).toEqual([]);
  });
});

describe("findClassUsages", () => {
  it("puts a widget in a layout grid under the grid, skipping the row and column", () => {
    const page = styledPage([layoutGrid("layoutGrid1", [gridRow([gridColumn([]), gridColumn([container("containerSummary", "card card--highlight")])])])]);
    expect(results(page, "card--highlight")).toEqual(["layoutGrid1 > containerSummary"]);
  });

  it("returns the document, the parent, the element and the hits", () => {
    const target = container("containerSummary", "card--highlight");
    const outer = container("outer", "", [target]);
    const [match] = findClassUsages(styledPage([outer]), doc, "card--highlight");
    expect(match.document).toBe(doc);
    expect(match.parent).toEqual({ id: outer.$ID, label: "outer", type: "Container" });
    expect(match.element).toEqual({ id: target.$ID, label: "containerSummary", type: "Container" });
    expect(match.hits).toEqual([{ field: "class", value: "card--highlight", ranges: [[0, 15]] }]);
  });

  it("has no parent for a widget right in a placeholder", () => {
    const [match] = findClassUsages(styledPage([container("c1", "card")]), doc, "card");
    expect(match.parent).toBeNull();
    expect(results(styledPage([container("c1", "card")]), "card")).toEqual(["c1"]);
  });

  it("finds a layout grid row that holds the class itself, under its grid", () => {
    const page = styledPage([layoutGrid("layoutGrid2", [gridRow([]), gridRow([gridColumn([])], "row card--highlight")])]);
    expect(results(page, "card--highlight")).toEqual(["layoutGrid2 > Row 2"]);
  });

  it("finds a class in Dynamic classes", () => {
    const page = styledPage([container("cardOrder", "card", [], "if $currentObject/IsUrgent then 'card--highlight' else ''")]);
    const [match] = findClassUsages(page, doc, "card--highlight");
    expect(match.hits.map((hit) => hit.field)).toEqual(["dynamicClasses"]);
  });

  it("finds a match and its nested matches separately, in model order", () => {
    const page = styledPage([container("outer", "card", [container("inner", "card")]), container("last", "card")]);
    expect(results(page, "card")).toEqual(["outer", "outer > inner", "last"]);
  });

  it("finds the page's own Class field without parent or element", () => {
    const [match] = findClassUsages(styledPage([], "page-orders"), doc, "page-orders");
    expect(match).toMatchObject({ parent: null, element: null });
  });

  it("searches snippets, layouts, building blocks and page templates", () => {
    expect(results(snippet({ widgets: [container("containerLine", "card")] }), "card")).toEqual(["containerLine"]);
    expect(results(layout("Layout_Backoffice", [container("sidebar", "", [container("containerHelp", "card")])], "layout-backoffice"), "card")).toEqual(["sidebar > containerHelp"]);
    expect(results(layout("Layout_Backoffice", [], "layout-backoffice"), "layout-backoffice")).toEqual(["(document)"]);
    expect(results(buildingBlock("BB_Card", [container("containerCard", "card")]), "card")).toEqual(["containerCard"]);
    expect(results(pageTemplate("PT_Dashboard", [container("containerKpi", "card")]), "card")).toEqual(["containerKpi"]);
  });

  it("puts a widget on a tab page under the tab container", () => {
    const page = styledPage([tabContainer("tabContainer1", [tabPage("tabOverview", []), tabPage("tabDetails", [container("containerDetails", "card")])])]);
    expect(results(page, "card")).toEqual(["tabContainer1 > containerDetails"]);
  });

  it("puts a widget in a pluggable widget's column under the pluggable widget", () => {
    const page = styledPage([dataGrid2("dataGrid2_1", [[container("containerName")], [container("containerAmount", "", [], "'card--highlight'")]])]);
    expect(results(page, "card--highlight")).toEqual(["dataGrid2_1 > containerAmount"]);
  });

  it("finds nothing for another case or a longer class", () => {
    const page = styledPage([container("c1", "card--highlight Card")]);
    expect(results(page, "card")).toEqual([]);
  });

  it("doesn't count design properties or style as the Class field", () => {
    const styled = container("c1");
    (styled.appearance as Record<string, unknown>).style = "card";
    (styled.appearance as Record<string, unknown>).designProperties = [element("Forms$DesignPropertyValue", { key: "card" })];
    expect(results(styledPage([styled]), "card")).toEqual([]);
  });
});
