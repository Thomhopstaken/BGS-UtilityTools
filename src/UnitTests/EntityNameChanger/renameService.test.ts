import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import type { EntityOption } from "../../EntityNameChanger/entityPicker";
import { countInScope, type RenameServiceDeps, runEntityRename } from "../../EntityNameChanger/renameService";
import type { AppModel } from "../../EntityNameChanger/updaters/updaterRegistry";
import { fakeContext, fakeProgressRunner, fakeUnitInfo } from "./helpers/fakes";

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

  it("allows a name that differs only in case from a taken one", async () => {
    const { runner, serviceDeps } = deps({ result: "Success" } as ProgressDialogResult, { entityNamesInModule: ["Order", "purchase"] });
    expect((await runEntityRename(serviceDeps, { entity: order, newName: "Purchase" })).kind).toBe("ran");
    expect(runner.titles).toHaveLength(1);
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
