import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import type { EntityOption } from "../../NameChanger/entityPicker";
import { RenameReport } from "../../NameChanger/framework/RenameReport";
import { UNCHANGED } from "../../shared/rename/types";
import { countInScope, type RenameServiceDeps, runEntityRename, savedInJob } from "../../NameChanger/renameService";
import type { AppModel } from "../../shared/rename/referenceTypes";
import { fakeContext } from "./helpers/fakes";
import { fakeProgressRunner, fakeUnitInfo } from "../shared/helpers/fakes";

// Marker objects: the dialog is faked, so no model API is called.
const model = new Proxy({} as Record<string, unknown>, {
  get: (target, name) => (target[name as string] ??= { api: name }),
}) as unknown as AppModel;

const order: EntityOption = { id: "entity-1", name: "Order", moduleName: "MyModule", domainModelId: "dm-1" };

function deps(result: ProgressDialogResult, overrides: Partial<RenameServiceDeps> = {}) {
  const runner = fakeProgressRunner(result);
  const serviceDeps: RenameServiceDeps = {
    model,
    runProgress: (title, steps) => runner.run(title, steps),
    excludedModules: new Set(["System", "Atlas_Core"]),
    allEntityNames: ["Order", "OrderLine", "Customer"],
    entityNamesInModule: ["Order", "OrderLine"],
    ...overrides,
  };
  return { runner, serviceDeps };
}

describe("runEntityRename", () => {
  it("rejects a name taken in the module without opening the dialog", async () => {
    const { runner, serviceDeps } = deps({ result: "Success" } as ProgressDialogResult);
    const result = await runEntityRename(serviceDeps, { entity: order, newName: "OrderLine" });
    expect(result).toEqual({ kind: "rejected", message: "An entity named MyModule.OrderLine already exists." });
    expect(runner.titles).toEqual([]);
  });

  it("runs the job in the progress dialog with the entity's context", async () => {
    const { runner, serviceDeps } = deps({ result: "Success" } as ProgressDialogResult);
    const result = await runEntityRename(serviceDeps, { entity: order, newName: "Purchase" });
    expect(runner.titles).toEqual(["Renaming MyModule.Order to Purchase"]);
    expect(runner.steps[0].title).toBe("Preparing");
    expect(runner.steps.map((s) => s.title)).toContain("Rename entity");
    expect(result.kind).toBe("ran");
    if (result.kind === "ran") {
      expect(result.dialog.result).toBe("Success");
      expect(result.context).toMatchObject({
        entityId: "entity-1",
        domainModelId: "dm-1",
        oldQualifiedName: "MyModule.Order",
        newQualifiedName: "MyModule.Purchase",
        protectedNames: ["OrderLine"],
      });
      expect([...result.context.excludedModules]).toEqual(["System", "Atlas_Core"]);
    }
  });

  it("returns the report of a cancelled run", async () => {
    const { serviceDeps } = deps({ result: "UserCancelled" } as ProgressDialogResult);
    const result = await runEntityRename(serviceDeps, { entity: order, newName: "Purchase" });
    expect(result.kind === "ran" && result.report.entitySkipReason).toBe("cancelled by user; nothing was changed");
  });

  it("puts the exposed names choice in the context, off by default", async () => {
    const { serviceDeps } = deps({ result: "Success" } as ProgressDialogResult);
    const off = await runEntityRename(serviceDeps, { entity: order, newName: "Purchase" });
    const on = await runEntityRename(serviceDeps, { entity: order, newName: "Purchase", renameExposedNames: true });
    expect(off.kind === "ran" && off.context.renameExposedNames).toBe(false);
    expect(on.kind === "ran" && on.context.renameExposedNames).toBe(true);
  });

  it("times the model API calls of each step in the report", async () => {
    // Every API method resolves to an empty list; the prepare step then fails, after its calls were timed.
    const emptyModel = new Proxy({} as Record<string, unknown>, {
      get: () => new Proxy({}, { get: () => async () => [] }),
    }) as unknown as AppModel;
    const { serviceDeps } = deps({ result: "Success" } as ProgressDialogResult, {
      model: emptyModel,
      runProgress: async (_, steps) => {
        await Promise.resolve(steps[0].action()).catch(() => undefined);
        return { result: "Success" } as ProgressDialogResult;
      },
    });
    const result = await runEntityRename(serviceDeps, { entity: order, newName: "Purchase" });
    expect(result.kind).toBe("ran");
    if (result.kind === "ran") {
      expect(result.report.timings.steps.map((s) => s.title)).toEqual(["Preparing"]);
      expect(result.report.timings.steps[0].calls.size).toBeGreaterThan(0);
      expect(result.report.timings.dialogMs).not.toBeNull();
    }
  });

  it("allows a name that differs only in case from a taken one", async () => {
    const { runner, serviceDeps } = deps({ result: "Success" } as ProgressDialogResult, { entityNamesInModule: ["Order", "purchase"] });
    expect((await runEntityRename(serviceDeps, { entity: order, newName: "Purchase" })).kind).toBe("ran");
    expect(runner.titles).toHaveLength(1);
  });
});

describe("savedInJob", () => {
  it("counts changed units and the entity's domain model once the entity was renamed", () => {
    const context = fakeContext();
    const report = new RenameReport();
    const isSaved = savedInJob(report, context);
    expect(isSaved(context.domainModelId)).toBe(false);
    report.entityRenamed = true;
    expect(isSaved(context.domainModelId)).toBe(true);
    report.addResult("Microflows", fakeUnitInfo("mf-1", "Microflows$Microflow"), { ...UNCHANGED, changed: true });
    report.addResult("Microflows", fakeUnitInfo("mf-2", "Microflows$Microflow"), { ...UNCHANGED });
    report.addError("Microflows", fakeUnitInfo("mf-3", "Microflows$Microflow"), "locked");
    expect(["mf-1", "mf-2", "mf-3"].map(isSaved)).toEqual([true, false, false]);
  });
});

describe("countInScope", () => {
  it("counts units in the app's own modules only", async () => {
    const context = fakeContext({ excludedModules: new Set(["System", "Atlas_Core"]) });
    const infos = [
      fakeUnitInfo("t1", "DocumentTemplates$DocumentTemplate", "MyModule", "DT_Order"),
      fakeUnitInfo("t2", "DocumentTemplates$DocumentTemplate", "Other", "DT_Invoice"),
      fakeUnitInfo("t3", "DocumentTemplates$DocumentTemplate", "Atlas_Core", "DT_Base"),
      { $ID: "t4", $Type: "DocumentTemplates$DocumentTemplate", name: "DT_Loose" } as never,
    ];
    expect(await countInScope({ getUnitsInfo: async () => infos }, context)).toBe(2);
  });

  it("passes a listing failure on", async () => {
    await expect(countInScope({ getUnitsInfo: () => Promise.reject(new Error("no api")) }, fakeContext())).rejects.toThrow("no api");
  });
});
