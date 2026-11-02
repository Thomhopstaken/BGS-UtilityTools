import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { ReferenceIndex } from "../../../shared/rename/ReferenceIndex";
import { JobReport } from "../../../shared/rename/JobReport";
import { UNCHANGED } from "../../../shared/rename/types";
import { ReferenceUpdater } from "../../../shared/rename/ReferenceUpdater";
import { fakeUnitAccess, fakeUnitInfo } from "../helpers/fakes";

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

describe("ReferenceUpdater.accepts", () => {
  it("accepts every unit without an index", () => {
    expect(setup().updater.accepts(info)).toBe(true);
  });

  it("accepts indexed units only when they reference a renamed name; others always", () => {
    const renames = new QualifiedNameRenames();
    renames.add("MyModule.Order", "MyModule.Purchase");
    const index = new ReferenceIndex();
    index.add("uses", { $Type: "Pages$Page", entity: "MyModule.Order" });
    index.add("unrelated", { $Type: "Pages$Page", entity: "MyModule.Customer" });
    const updater = new ReferenceUpdater({ documents: "pages", unitType: "Pages$Page" }, fakeUnitAccess<Primitives.UnitBase>([]), renames, index);
    const of = (id: string) => fakeUnitInfo(id, "Pages$Page");
    expect(["uses", "unrelated", "not-indexed"].map((id) => updater.accepts(of(id)))).toEqual([true, false, true]);
  });

  it("skips a unit saved up to date in the rename phase, but not one whose save failed", () => {
    const renames = new QualifiedNameRenames();
    renames.add("MyModule.Order", "MyModule.Purchase");
    const index = new ReferenceIndex();
    index.add("saved", { $Type: "Microflows$Microflow", entity: "MyModule.Order" });
    index.add("failed", { $Type: "Microflows$Microflow", entity: "MyModule.Order" });
    index.markUpToDate("saved");
    index.markUpToDate("failed");
    const updater = new ReferenceUpdater({ documents: "microflows", unitType: "Microflows$Microflow" }, fakeUnitAccess<Primitives.UnitBase>([]), renames, index);
    const report = new JobReport();
    report.addResult("Microflows", fakeUnitInfo("saved", "Microflows$Microflow"), { ...UNCHANGED, changed: true, updatedReferences: 1 });
    report.addError("Microflows", fakeUnitInfo("failed", "Microflows$Microflow"), "locked");
    expect(updater.accepts(fakeUnitInfo("saved", "Microflows$Microflow"), report)).toBe(false);
    expect(updater.accepts(fakeUnitInfo("failed", "Microflows$Microflow"), report)).toBe(true);
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

describe("ReferenceUpdater description and idle", () => {
  it("keeps the entity rename wording without a description", () => {
    expect(setup().updater.description).toBe("Updating references to renamed entity, documents and parameters");
  });

  it("uses the description it is given", () => {
    const updater = new ReferenceUpdater(
      { documents: "pages", unitType: "Pages$Page", description: "Updating references to renamed documents" },
      fakeUnitAccess<Primitives.UnitBase>([]),
      new QualifiedNameRenames(),
    );
    expect(updater.description).toBe("Updating references to renamed documents");
  });

  it("is idle only while nothing is renamed", () => {
    const renames = new QualifiedNameRenames();
    const updater = new ReferenceUpdater({ documents: "pages", unitType: "Pages$Page" }, fakeUnitAccess<Primitives.UnitBase>([]), renames);
    expect(updater.isIdle()).toBe(true);
    renames.add("M.A", "M.B");
    expect(updater.isIdle()).toBe(false);
    renames.remove("M.A");
    expect(updater.isIdle()).toBe(true);
  });
});
