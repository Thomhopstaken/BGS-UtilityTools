import { describe, expect, it } from "vitest";
import { NO_LOCAL_RENAMES } from "../../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import { ViewEntitySourceInspector } from "../../../../EntityNameChanger/updaters/documents/ViewEntitySourceInspector";
import { viewEntitySourceDocument } from "../../helpers/documentBuilders";
import { fakeContext, fakeUnitInfo } from "../../helpers/fakes";

const inspector = new ViewEntitySourceInspector(fakeContext());
const info = (moduleName: string, name: string) => fakeUnitInfo("v", "DomainModels$ViewEntitySourceDocument", moduleName, name);

describe("ViewEntitySourceInspector.usesEntity", () => {
  it("is true for the renamed view entity's own source, old or new name", () => {
    expect(inspector.usesEntity(viewEntitySourceDocument("Order", "SELECT 1"), info("MyModule", "Order"))).toBe(true);
    expect(inspector.usesEntity(viewEntitySourceDocument("Purchase", "SELECT 1"), info("MyModule", "Purchase"))).toBe(true);
  });

  it("is false for other sources, even when their query uses the entity", () => {
    expect(inspector.usesEntity(viewEntitySourceDocument("OrderOverview", "SELECT o.Total FROM MyModule.Order AS o"), info("MyModule", "OrderOverview"))).toBe(false);
    expect(inspector.usesEntity(viewEntitySourceDocument("Order", "SELECT 1"), info("Other", "Order"))).toBe(false);
  });
});

describe("ViewEntitySourceInspector local renames", () => {
  it("has none and changes nothing", () => {
    const document = viewEntitySourceDocument("Order", "SELECT o.Total FROM MyModule.Order AS o");
    expect(inspector.planLocalRenames(document)).toBe(NO_LOCAL_RENAMES);
    expect(inspector.apply(document, NO_LOCAL_RENAMES)).toBe(0);
    expect(document.oql).toBe("SELECT o.Total FROM MyModule.Order AS o");
  });
});
