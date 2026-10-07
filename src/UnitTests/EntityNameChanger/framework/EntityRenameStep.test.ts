import type { DomainModels } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { changed, fakeContext, fakeUnitInfo } from "../helpers/fakes";
import { type DomainModelAccess, EntityRenameStep, findEntityProblem } from "../../../EntityNameChanger/framework/EntityRenameStep";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";

const context = fakeContext();

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
    expect(await new EntityRenameStep(access, context).validate()).toBeNull();
    expect(access.loads).toEqual([{ type: "DomainModels$DomainModel", id: "dm-1" }]);
  });

  it("validate reports a missing domain model", async () => {
    expect(await new EntityRenameStep(fakeDomainModels(null), context).validate()).toBe(
      "Domain model of MyModule not found.",
    );
  });

  it("run renames and saves the entity", async () => {
    const entity = { $ID: "entity-1", name: "Order" };
    const model = domainModel([entity]);
    const access = fakeDomainModels(model);
    const report = new RenameReport();
    expect(await new EntityRenameStep(access, context).run(report)).toBe(true);
    expect(entity.name).toBe("Purchase");
    expect(access.saved).toEqual([model]);
    expect(report.entityRenamed).toBe(true);
  });

  it("run skips the entity when documents failed, without loading", async () => {
    const access = fakeDomainModels(domainModel([{ $ID: "entity-1", name: "Order" }]));
    const report = new RenameReport();
    report.addError("Microflows", fakeUnitInfo("a", "Microflows$Microflow"), new Error("x"));
    expect(await new EntityRenameStep(access, context).run(report)).toBe(true);
    expect(access.loads).toEqual([]);
    expect(report.entityRenamed).toBe(false);
    expect(report.entitySkipReason).toBe("1 documents failed to update; fix them and rerun");
  });

  it("run reports a missing domain model", async () => {
    const report = new RenameReport();
    report.addResult("Microflows", fakeUnitInfo("a", "Microflows$Microflow"), changed());
    expect(await new EntityRenameStep(fakeDomainModels(null), context).run(report)).toBe(
      "Domain model of MyModule not found.",
    );
  });

  it("run returns and records a problem found at run time", async () => {
    const access = fakeDomainModels(domainModel([]));
    const report = new RenameReport();
    const outcome = await new EntityRenameStep(access, context).run(report);
    expect(outcome).toBe("Entity MyModule.Order not found in its domain model.");
    expect(report.entitySkipReason).toBe(outcome);
    expect(access.saved).toEqual([]);
  });
});
