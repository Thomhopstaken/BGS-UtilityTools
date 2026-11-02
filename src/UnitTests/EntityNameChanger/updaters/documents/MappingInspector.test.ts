import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { NO_LOCAL_RENAMES } from "../../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import { MappingInspector } from "../../../../EntityNameChanger/updaters/documents/MappingInspector";
import { exportMapping, importMapping, objectElement, valueElement } from "../../helpers/documentBuilders";
import { objectType } from "../../helpers/microflowBuilders";
import { fakeContext } from "../../helpers/fakes";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
const QNAME = "MyModule.Order";

function setup() {
  const used = new Set<string>();
  const inspector = new MappingInspector(context, new NamingPolicy(context.oldName, context.newName, context.protectedNames), used);
  return { inspector, used };
}

describe("MappingInspector.usesEntity", () => {
  it("finds the entity in a root or nested object element", () => {
    const { inspector } = setup();
    expect(inspector.usesEntity(importMapping({ roots: [objectElement(QNAME, [valueElement(`${QNAME}.Total`)])] }))).toBe(true);
    const nested = objectElement("MyModule.Customer", [objectElement("MyModule.Purchase")]);
    expect(inspector.usesEntity(exportMapping({ roots: [nested] }))).toBe(true);
  });

  it("finds the entity as import mapping parameter type", () => {
    const { inspector } = setup();
    expect(inspector.usesEntity(importMapping({}, objectType(QNAME) as never))).toBe(true);
  });

  it("is false for mappings of other entities", () => {
    const { inspector } = setup();
    expect(inspector.usesEntity(importMapping({ roots: [objectElement("MyModule.OrderLine")] }))).toBe(false);
    expect(inspector.usesEntity(exportMapping({ roots: [objectElement(null)] }))).toBe(false);
  });

  it("collects the JSON structures of entity mappings only", () => {
    const { inspector, used } = setup();
    inspector.usesEntity(importMapping({ roots: [objectElement(QNAME)], jsonStructure: "MyModule.JSON_Order" }));
    inspector.usesEntity(importMapping({ roots: [objectElement("MyModule.Customer")], jsonStructure: "MyModule.JSON_Customer" }));
    inspector.usesEntity(exportMapping({ roots: [objectElement(QNAME)], jsonStructure: null }));
    expect([...used]).toEqual(["MyModule.JSON_Order"]);
  });
});

describe("MappingInspector local renames", () => {
  it("renames the export mapping parameter when the root maps the entity", () => {
    const { inspector } = setup();
    const mapping = exportMapping({ roots: [objectElement(QNAME)] }, "OrderList");
    const local = inspector.planLocalRenames(mapping);
    expect(local).toEqual({ renames: new Map([["OrderList", "PurchaseList"]]), referencedByCallers: false });
    expect(inspector.apply(mapping, local)).toBe(1);
    expect(mapping.parameterName).toBe("PurchaseList");
  });

  it("keeps the parameter of another root entity or without the name", () => {
    const { inspector } = setup();
    expect(inspector.planLocalRenames(exportMapping({ roots: [objectElement("MyModule.Customer", [objectElement(QNAME)])] }, "Order"))).toBe(NO_LOCAL_RENAMES);
    expect(inspector.planLocalRenames(exportMapping({ roots: [objectElement(QNAME)] }, "Parameter"))).toBe(NO_LOCAL_RENAMES);
  });

  it("has no local renames for import mappings", () => {
    const { inspector } = setup();
    const mapping = importMapping({ roots: [objectElement(QNAME)] });
    expect(inspector.planLocalRenames(mapping)).toBe(NO_LOCAL_RENAMES);
    expect(inspector.apply(mapping, { renames: new Map([["Order", "Purchase"]]), referencedByCallers: false })).toBe(0);
  });
});
