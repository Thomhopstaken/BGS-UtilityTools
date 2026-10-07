import { describe, expect, it } from "vitest";
import { DocumentNameRegistry } from "../../../../EntityNameChanger/framework/DocumentNameRegistry";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { NOT_RENAMED, planDocumentRename } from "../../../../EntityNameChanger/updaters/shared/renameDocument";
import { fakeUnitInfo } from "../../helpers/fakes";

const naming = new NamingPolicy("Order", "Purchase", []);
const info = fakeUnitInfo("doc-1", "Pages$Page");

function registry(...names: string[]) {
  const documentNames = new DocumentNameRegistry();
  names.forEach((name) => documentNames.add("MyModule", name));
  return documentNames;
}

describe("planDocumentRename", () => {
  it("plans the new name and reserves it in the registry", () => {
    const documentNames = registry("Order_Edit");
    expect(planDocumentRename("page", "Order_Edit", info, naming, documentNames, true)).toEqual({ renamedTo: "Purchase_Edit", skipped: 0 });
    expect(documentNames.isFree("MyModule", "Order_Edit")).toBe(true);
    expect(documentNames.isFree("MyModule", "Purchase_Edit")).toBe(false);
  });

  it("does not plan the same new name twice", () => {
    const documentNames = registry("Order_Edit", "Order_Edit2");
    const twice = new NamingPolicy("Order_Edit2", "Purchase_Edit", []);
    expect(planDocumentRename("page", "Order_Edit", info, naming, documentNames, true).renamedTo).toBe("Purchase_Edit");
    expect(planDocumentRename("page", "Order_Edit2", info, twice, documentNames, true)).toEqual({ renamedTo: null, skipped: 1 });
  });

  it("skips when the new name is taken", () => {
    expect(planDocumentRename("page", "Order_Edit", info, naming, registry("Order_Edit", "Purchase_Edit"), true)).toEqual({
      renamedTo: null,
      skipped: 1,
    });
  });

  it("does nothing when not allowed", () => {
    expect(planDocumentRename("page", "Order_Edit", info, naming, registry(), false)).toEqual(NOT_RENAMED);
  });

  it("does nothing when the name does not contain the entity name", () => {
    expect(planDocumentRename("page", "Customer_Edit", info, naming, registry(), true)).toEqual(NOT_RENAMED);
  });

  it("does nothing for a unit without a module", () => {
    const noModule = { $ID: "doc-1", $Type: "Pages$Page", name: "Order_Edit" } as never;
    expect(planDocumentRename("page", "Order_Edit", noModule, naming, registry(), true).renamedTo).toBeNull();
  });
});
