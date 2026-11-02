import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import { UNCHANGED } from "../../../../EntityNameChanger/framework/types";
import { ReferenceUpdater } from "../../../../EntityNameChanger/updaters/references/ReferenceUpdater";
import { fakeUnitAccess, fakeUnitInfo } from "../../helpers/fakes";

function setup() {
  const renames = new QualifiedNameRenames();
  renames.add("MyModule.Order", "MyModule.Purchase");
  const access = fakeUnitAccess<Primitives.UnitBase>([]);
  const updater = new ReferenceUpdater({ documents: "pages", unitType: "Pages$Page" }, access, renames);
  return { updater, access, renames };
}

const info = fakeUnitInfo("p1", "Pages$Page", "MyModule", "Customer_Edit");

describe("ReferenceUpdater with onlyProperties", () => {
  it("rewrites only the listed properties", async () => {
    const renames = new QualifiedNameRenames();
    renames.add("MyModule.Order", "MyModule.Purchase");
    const updater = new ReferenceUpdater(
      { documents: "consumed REST services", unitType: "Rest$ConsumedRestService", onlyProperties: new Set(["entity"]) },
      fakeUnitAccess<Primitives.UnitBase>([]),
      renames,
    );
    const element = { $Type: "ImportMappings$ImportObjectMappingElement", entity: "MyModule.Order", documentation: "MyModule.Order" };
    const unit = { $Type: "Rest$ConsumedRestService", name: "CRS", operations: [element] } as unknown as Primitives.UnitBase;
    expect(await updater.update(unit, fakeUnitInfo("c1", "Rest$ConsumedRestService", "MyModule", "CRS"))).toEqual({ ...UNCHANGED, changed: true, updatedReferences: 1 });
    expect(element).toMatchObject({ entity: "MyModule.Purchase", documentation: "MyModule.Order" });
    expect(updater.onlyProperties).toEqual(new Set(["entity"]));
  });
});

describe("ReferenceUpdater", () => {
  it("has the reference metadata", () => {
    const { updater, access } = setup();
    expect(updater).toMatchObject({ label: "References in pages", unitType: "Pages$Page", implemented: true });
    expect(updater.access).toBe(access);
  });

  it("rewrites references and reports the count", async () => {
    const { updater } = setup();
    const entityRef = { $Type: "DomainModels$DirectEntityRef", entity: "MyModule.Order" };
    const attribute = { $Type: "DomainModels$AttributeRef", attribute: "MyModule.Order.Name" };
    const unit = { $Type: "Pages$Page", $ID: "p1", name: "Customer_Edit", widgets: [entityRef, attribute] } as unknown as Primitives.UnitBase;
    expect(await updater.update(unit, info)).toEqual({ ...UNCHANGED, changed: true, updatedReferences: 2 });
    expect(entityRef.entity).toBe("MyModule.Purchase");
    expect(attribute.attribute).toBe("MyModule.Purchase.Name");
  });

  it("reports a unit without references as unchanged", async () => {
    const { updater } = setup();
    const unit = { $Type: "Pages$Page", $ID: "p1", name: "Order_Help", entity: "MyModule.OrderLine" } as unknown as Primitives.UnitBase;
    expect(await updater.update(unit, info)).toEqual(UNCHANGED);
  });

  it("uses renames recorded after it was created", async () => {
    const { updater, renames } = setup();
    renames.addDocument("MyModule", "ACT_Order", "ACT_Purchase");
    const settings = { $Type: "Pages$MicroflowSettings", microflow: "MyModule.ACT_Order" };
    const unit = { $Type: "Pages$Page", $ID: "p1", name: "Customer_Edit", widgets: [settings] } as unknown as Primitives.UnitBase;
    expect((await updater.update(unit, info)).updatedReferences).toBe(1);
    expect(settings.microflow).toBe("MyModule.ACT_Purchase");
  });

  it("rewrites a rule call and its parameter mappings after the rule and parameter renames", async () => {
    const { renames } = setup();
    renames.addDocument("MyModule", "Order_IsValid", "Purchase_IsValid");
    renames.addParameter("MyModule", "Order_IsValid", "Purchase_IsValid", "Order", "Purchase");
    const updater = new ReferenceUpdater({ documents: "microflows", unitType: "Microflows$Microflow" }, fakeUnitAccess<Primitives.UnitBase>([]), renames);
    const mapping = { $Type: "Microflows$RuleCallParameterMapping", parameter: "MyModule.Order_IsValid.Order", argument: "$Purchase" };
    const ruleCall = { $Type: "Microflows$RuleCall", rule: "MyModule.Order_IsValid", parameterMappings: [mapping] };
    const split = { $Type: "Microflows$ExclusiveSplit", splitCondition: { $Type: "Microflows$RuleSplitCondition", ruleCall } };
    const unit = { $Type: "Microflows$Microflow", $ID: "mf1", name: "ACT_Check", objectCollection: { objects: [split] } } as unknown as Primitives.UnitBase;
    expect((await updater.update(unit, fakeUnitInfo("mf1", "Microflows$Microflow", "MyModule", "ACT_Check"))).updatedReferences).toBe(2);
    expect(ruleCall.rule).toBe("MyModule.Purchase_IsValid");
    expect(mapping.parameter).toBe("MyModule.Purchase_IsValid.Purchase");
  });
});
