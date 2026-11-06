import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import type { DocumentKind } from "../../ClassSearcher/documentKinds";
import { type ClassSearchModel, searchClass } from "../../ClassSearcher/search/classSearch";
import { snippet } from "../NameChanger/helpers/pageBuilders";
import { fakeUnitAccess, fakeUnitInfo } from "../shared/helpers/fakes";
import { buildingBlock, container, layout, pageTemplate, styledPage } from "./helpers/classBuilders";

type Unit = Primitives.UnitBase;

// A unit with the given $ID; the builders make their own.
function withId<T extends object>(id: string, unit: T): Unit {
  return Object.assign(unit, { $ID: id }) as unknown as Unit;
}

function model(documents: Partial<Record<DocumentKind, { units: Unit[]; infos: Readonly<Primitives.UnitInfo>[] }>>) {
  const access = (kind: DocumentKind) => fakeUnitAccess(documents[kind]?.units ?? [], documents[kind]?.infos ?? []);
  const fakes = {
    page: access("page"),
    snippet: access("snippet"),
    layout: access("layout"),
    buildingBlock: access("buildingBlock"),
    pageTemplate: access("pageTemplate"),
  };
  const searchModel: ClassSearchModel = {
    modules: {
      getModules: async () => [
        { name: "Sales", fromAppStore: false },
        { name: "Atlas_Core", fromAppStore: true },
      ],
    },
    documents: fakes,
  };
  return { searchModel, fakes };
}

describe("searchClass", () => {
  it("searches every document kind in the app's own modules", async () => {
    const { searchModel } = model({
      page: { units: [withId("p1", styledPage([container("c1", "card")]))], infos: [fakeUnitInfo("p1", "Pages$Page", "Sales", "Order_Overview")] },
      snippet: { units: [withId("s1", snippet({ widgets: [container("c2", "card")] }))], infos: [fakeUnitInfo("s1", "Pages$Snippet", "Sales", "SNIP_Line")] },
      layout: { units: [withId("l1", layout("Layout_Main", [container("c3", "card")]))], infos: [fakeUnitInfo("l1", "Pages$Layout", "Sales", "Layout_Main")] },
      buildingBlock: { units: [withId("b1", buildingBlock("BB", [container("c4", "card")]))], infos: [fakeUnitInfo("b1", "Pages$BuildingBlock", "Sales", "BB")] },
      pageTemplate: { units: [withId("t1", pageTemplate("PT", [container("c5", "card")]))], infos: [fakeUnitInfo("t1", "Pages$PageTemplate", "Sales", "PT")] },
    });
    const result = await searchClass(searchModel, "card");
    expect(result.className).toBe("card");
    expect(result.documentsSearched).toBe(5);
    expect(result.matches.map((match) => [match.document.qualifiedName, match.document.kind, match.document.id])).toEqual([
      ["Sales.Order_Overview", "page", "p1"],
      ["Sales.SNIP_Line", "snippet", "s1"],
      ["Sales.Layout_Main", "layout", "l1"],
      ["Sales.BB", "buildingBlock", "b1"],
      ["Sales.PT", "pageTemplate", "t1"],
    ]);
  });

  it("skips Marketplace modules and System", async () => {
    const { searchModel, fakes } = model({
      page: {
        units: [withId("p1", styledPage([container("c1", "card")])), withId("p2", styledPage([container("c2", "card")])), withId("p3", styledPage([container("c3", "card")]))],
        infos: [
          fakeUnitInfo("p1", "Pages$Page", "Sales", "Own"),
          fakeUnitInfo("p2", "Pages$Page", "Atlas_Core", "Marketplace"),
          fakeUnitInfo("p3", "Pages$Page", "System", "System"),
        ],
      },
    });
    const result = await searchClass(searchModel, "card");
    expect(result.matches.map((match) => match.document.qualifiedName)).toEqual(["Sales.Own"]);
    expect(result.documentsSearched).toBe(1);
    expect(fakes.page.saved).toEqual([]);
  });

  it("loads in batches and reads each API's unit infos once", async () => {
    const pages = ["p1", "p2", "p3"];
    const { searchModel, fakes } = model({
      page: { units: pages.map((id) => withId(id, styledPage([]))), infos: pages.map((id) => fakeUnitInfo(id, "Pages$Page", "Sales", id)) },
    });
    const result = await searchClass(searchModel, "card", 2);
    expect(fakes.page.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
    expect(fakes.page.getUnitsInfoCalls).toBe(1);
    expect(result).toMatchObject({ matches: [], documentsSearched: 3 });
  });

  it("names a document by its $ID when it has no name", async () => {
    const { searchModel } = model({
      page: { units: [withId("p1", styledPage([container("c1", "card")]))], infos: [{ $ID: "p1", $Type: "Pages$Page", moduleName: "Sales" } as Primitives.UnitInfo] },
    });
    const result = await searchClass(searchModel, "card");
    expect(result.matches[0].document.qualifiedName).toBe("Sales.p1");
  });

  it("fails when loading fails", async () => {
    const { searchModel, fakes } = model({
      page: { units: [withId("p1", styledPage([]))], infos: [fakeUnitInfo("p1", "Pages$Page", "Sales", "Own")] },
    });
    fakes.page.loadError = new Error("offline");
    await expect(searchClass(searchModel, "card")).rejects.toThrow("offline");
  });
});
