import type { DomainModels, Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { AssociationRenamePlan } from "../../../../EntityNameChanger/framework/AssociationRenamePlan";
import { DocumentNameRegistry } from "../../../../EntityNameChanger/framework/DocumentNameRegistry";
import { DocumentRenamePlan } from "../../../../EntityNameChanger/framework/DocumentRenamePlan";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import { RenameReport } from "../../../../EntityNameChanger/framework/RenameReport";
import { AssociationUpdater, type AssociationUpdaterDeps } from "../../../../EntityNameChanger/updaters/domainModels/AssociationUpdater";
import { association, crossAssociation, domainModelWith } from "../../helpers/domainModelBuilders";
import { fakeContext, fakeUnitAccess, fakeUnitInfo } from "../../helpers/fakes";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });

function deps(documentNames = new DocumentNameRegistry()): AssociationUpdaterDeps {
  return {
    context,
    naming: new NamingPolicy(context.oldName, context.newName, context.protectedNames),
    documentNames,
    documentPlan: new DocumentRenamePlan(),
    renames: QualifiedNameRenames.forEntity(context),
    plan: new AssociationRenamePlan(),
  };
}

function updaters(shared = deps()) {
  const access = fakeUnitAccess<DomainModels.DomainModel>([]);
  return {
    shared,
    planner: new AssociationUpdater("plan", access, shared),
    renamer: new AssociationUpdater("rename", access, shared),
  };
}

const ownInfo = fakeUnitInfo(context.domainModelId, "DomainModels$DomainModel", "MyModule");
const otherInfo = fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Other");

describe("AssociationUpdater", () => {
  it("labels and titles both phases", () => {
    const { planner, renamer } = updaters();
    expect([planner.label, planner.title, renamer.label, renamer.title]).toEqual(["Associations (plan)", "Planning associations", "Associations", undefined]);
    expect(planner.unitType).toBe("DomainModels$DomainModel");
    expect(planner.implemented).toBe(true);
  });

  it("plans connected associations without changing the unit", async () => {
    const { shared, planner } = updaters();
    const own = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    const line = association("a2", "OrderLine_Order", "MyModule.OrderLine", "MyModule.Order");
    const unconnected = association("a3", "Customer_LastOrder", "MyModule.Customer", "MyModule.Invoice");
    const model = domainModelWith(context.domainModelId, { entities: ["Order", "OrderLine", "Customer"], associations: [own, line, unconnected] });
    expect(await planner.update(model, ownInfo)).toMatchObject({ changed: false, skippedRenames: 0 });
    expect([own.name, line.name, unconnected.name]).toEqual(["Order_Customer", "OrderLine_Order", "Customer_LastOrder"]);
    expect([...shared.plan.get(context.domainModelId)]).toEqual([
      ["a1", "Purchase_Customer"],
      ["a2", "OrderLine_Purchase"],
    ]);
    expect(shared.renames.map.get("MyModule.Order_Customer")).toBe("MyModule.Purchase_Customer");
    expect(shared.renames.map.get("MyModule.OrderLine_Order")).toBe("MyModule.OrderLine_Purchase");
    expect(shared.renames.map.has("MyModule.Customer_LastOrder")).toBe(false);
  });

  it("plans cross associations in other domain models", async () => {
    const { shared, planner } = updaters();
    const cross = crossAssociation("a1", "Invoice_Order", "Other.Invoice", "MyModule.Order");
    await planner.update(domainModelWith("dm-2", { entities: ["Invoice"], crossAssociations: [cross] }), otherInfo);
    expect(shared.plan.get("dm-2").get("a1")).toBe("Invoice_Purchase");
    expect(shared.renames.map.get("Other.Invoice_Order")).toBe("Other.Invoice_Purchase");
    // Declared by the domain model it lives in.
    expect(shared.renames.existing((id) => id === "dm-2").has("Other.Invoice_Order")).toBe(true);
    expect(shared.renames.existing(() => false).size).toBe(0);
  });

  it("skips a rename when the name is taken by an association or entity", async () => {
    const { shared, planner } = updaters();
    const first = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    const taken = association("a2", "Purchase_Customer", "MyModule.Customer", "MyModule.Invoice");
    const second = association("a3", "Order_Invoice", "MyModule.Order", "MyModule.Invoice");
    const model = domainModelWith(context.domainModelId, { entities: ["Order", "Purchase_Invoice"], associations: [first, taken, second] });
    expect(await planner.update(model, ownInfo)).toMatchObject({ skippedRenames: 2 });
    expect(shared.plan.count).toBe(0);
  });

  it("skips the second of two associations that would get the same name", async () => {
    const { shared, planner } = updaters();
    const first = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    const second = association("a2", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    const model = domainModelWith(context.domainModelId, { associations: [first, second] });
    expect(await planner.update(model, ownInfo)).toMatchObject({ skippedRenames: 1 });
    expect([...shared.plan.get(context.domainModelId).keys()]).toEqual(["a1"]);
  });

  it("renames a document and an association sharing a name together", async () => {
    const documentNames = new DocumentNameRegistry();
    documentNames.add("MyModule", "Order_Customer");
    const shared = deps(documentNames);
    shared.documentPlan.set("page-1", { renamedTo: null, skipped: 0 }, "MyModule.Order_Customer");
    const { planner } = updaters(shared);
    const own = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    await planner.update(domainModelWith(context.domainModelId, { associations: [own] }), ownInfo);
    expect(shared.plan.get(context.domainModelId).get("a1")).toBe("Purchase_Customer");
    expect(shared.documentPlan.get("page-1").renamedTo).toBe("Purchase_Customer");
  });

  it("skips an association sharing its name with a document that is not renamed", async () => {
    const documentNames = new DocumentNameRegistry();
    documentNames.add("MyModule", "Order_Customer");
    const shared = deps(documentNames);
    const { planner } = updaters(shared);
    const own = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    expect(await planner.update(domainModelWith(context.domainModelId, { associations: [own] }), ownInfo)).toMatchObject({ skippedRenames: 1 });
    expect(shared.plan.count).toBe(0);
    expect(shared.renames.map.has("MyModule.Order_Customer")).toBe(false);
  });

  it("skips a domain model without a module", async () => {
    const { shared, planner } = updaters();
    const own = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    const info = { $ID: "dm-x", $Type: "DomainModels$DomainModel" } as Primitives.UnitInfo;
    expect(await planner.update(domainModelWith("dm-x", { associations: [own] }), info)).toMatchObject({ changed: false });
    expect(shared.plan.count).toBe(0);
  });

  it("plan accepts every domain model", () => {
    expect(updaters().planner.accepts(ownInfo)).toBe(true);
  });

  it("rename accepts only other domain models with planned renames", () => {
    const { shared, renamer } = updaters();
    shared.plan.set(context.domainModelId, "a1", "Purchase_Customer");
    shared.plan.set("dm-2", "a2", "Invoice_Purchase");
    expect(renamer.accepts(ownInfo)).toBe(false);
    expect(renamer.accepts(otherInfo)).toBe(true);
    expect(renamer.accepts(fakeUnitInfo("dm-3", "DomainModels$DomainModel", "Third"))).toBe(false);
  });

  it("rename applies the plan", async () => {
    const { shared, renamer } = updaters();
    const cross = crossAssociation("a1", "Invoice_Order", "Other.Invoice", "MyModule.Order");
    shared.plan.set("dm-2", "a1", "Invoice_Purchase");
    const result = await renamer.update(domainModelWith("dm-2", { crossAssociations: [cross] }), otherInfo);
    expect(result).toMatchObject({ changed: true, renamedTo: null, renamedAssociations: 1 });
    expect(cross.name).toBe("Invoice_Purchase");
    const report = new RenameReport();
    report.addResult(renamer.label, otherInfo, result);
    expect(report.renamedAssociations).toBe(1);
  });

  it("rename reports no change without a plan", async () => {
    const { renamer } = updaters();
    expect(await renamer.update(domainModelWith("dm-2"), otherInfo)).toMatchObject({ changed: false, renamedAssociations: 0 });
  });
});
