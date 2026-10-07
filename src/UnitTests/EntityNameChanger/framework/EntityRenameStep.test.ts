import type { DomainModels } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { fakeContext, fakeUnitInfo } from "../helpers/fakes";
import { type DomainModelAccess, EntityRenameStep, findEntityProblem } from "../../../EntityNameChanger/framework/EntityRenameStep";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";

const context = fakeContext();

function step(access: DomainModelAccess): EntityRenameStep {
  return new EntityRenameStep(access, context);
}

function domainModel(entities: { $ID: string; name: string }[]): DomainModels.DomainModel {
  return { $ID: "dm-1", entities } as unknown as DomainModels.DomainModel;
}

function fakeDomainModels(model: DomainModels.DomainModel | null) {
  const access = {
    loads: [] as { type: string; id: string }[],
    saved: [] as unknown[],
    async load(type: string, id: string) {
      access.loads.push({ type, id });
      return model;
    },
    async save(element: unknown) {
      access.saved.push(element);
    },
  };
  return access as typeof access & DomainModelAccess;
}

describe("findEntityProblem", () => {
  it("reports a missing entity", () => {
    expect(findEntityProblem(domainModel([]), context)).toBe("Entity MyModule.Order not found in its domain model.");
  });

  it("reports a taken name", () => {
    const model = domainModel([
      { $ID: "entity-1", name: "Order" },
      { $ID: "entity-2", name: "Purchase" },
    ]);
    expect(findEntityProblem(model, context)).toBe("An entity named MyModule.Purchase already exists.");
  });

  it("allows a name that differs only in case", () => {
    const model = domainModel([
      { $ID: "entity-1", name: "Order" },
      { $ID: "entity-2", name: "purchase" },
    ]);
    expect(findEntityProblem(model, context)).toBeNull();
  });

  it("accepts a free name", () => {
    expect(findEntityProblem(domainModel([{ $ID: "entity-1", name: "Order" }]), context)).toBeNull();
  });
});

describe("EntityRenameStep", () => {
  it("validate loads the domain model fresh by id", async () => {
    const access = fakeDomainModels(domainModel([{ $ID: "entity-1", name: "Order" }]));
    expect(await step(access).validate()).toBeNull();
    expect(access.loads).toEqual([{ type: "DomainModels$DomainModel", id: "dm-1" }]);
  });

  it("validate reports a missing domain model", async () => {
    expect(await step(fakeDomainModels(null)).validate()).toBe("Domain model of MyModule not found.");
  });

  it("run renames and saves the entity", async () => {
    const entity = { $ID: "entity-1", name: "Order" };
    const model = domainModel([entity]);
    const access = fakeDomainModels(model);
    const report = new RenameReport();
    expect(await step(access).run(report)).toBe(true);
    expect(entity.name).toBe("Purchase");
    expect(access.saved).toEqual([model]);
    expect(report.entityRenamed).toBe(true);
  });

  it("run rewrites only the entity's own references in its domain model, in the same save", async () => {
    const entity = { $Type: "DomainModels$Entity", $ID: "entity-1", name: "Order" };
    const memberAccess = { $Type: "DomainModels$MemberAccess", attribute: "MyModule.Order.Total" };
    const handler = { $Type: "DomainModels$EventHandler", microflow: "MyModule.ACR_Order" };
    const line = { $Type: "DomainModels$Entity", $ID: "entity-2", name: "OrderLine", generalization: "MyModule.Order" };
    const model = { $Type: "DomainModels$DomainModel", $ID: "dm-1", entities: [entity, line], memberAccess, handler } as unknown as DomainModels.DomainModel;
    const access = fakeDomainModels(model);
    const report = new RenameReport();
    expect(await step(access).run(report)).toBe(true);
    expect(entity.name).toBe("Purchase");
    expect(line.name).toBe("OrderLine");
    expect(memberAccess.attribute).toBe("MyModule.Purchase.Total");
    expect(line.generalization).toBe("MyModule.Purchase");
    // Renamed documents are left to the reference pass.
    expect(handler.microflow).toBe("MyModule.ACR_Order");
    expect(access.saved).toEqual([model]);
    expect(report.updatedReferences).toBe(2);
  });

  it("run stops the job without loading or saving when planning failed", async () => {
    const access = fakeDomainModels(domainModel([{ $ID: "entity-1", name: "Order" }]));
    const report = new RenameReport();
    report.addError("Microflows (plan)", fakeUnitInfo("a", "Microflows$Microflow"), new Error("x"));
    const outcome = await step(access).run(report);
    expect(outcome).toBe("1 documents could not be checked; nothing was changed");
    expect(access.loads).toEqual([]);
    expect(access.saved).toEqual([]);
    expect(report.entityRenamed).toBe(false);
    expect(report.entitySkipReason).toBe(outcome);
  });

  it("run stops the job when the domain model is missing", async () => {
    const report = new RenameReport();
    const outcome = await step(fakeDomainModels(null)).run(report);
    expect(outcome).toBe("Domain model of MyModule not found.");
    expect(report.entitySkipReason).toBe(outcome);
  });

  it("run stops the job without saving when a problem is found at run time", async () => {
    const access = fakeDomainModels(domainModel([]));
    const report = new RenameReport();
    const outcome = await step(access).run(report);
    expect(outcome).toBe("Entity MyModule.Order not found in its domain model.");
    expect(report.entitySkipReason).toBe(outcome);
    expect(access.saved).toEqual([]);
  });
});
