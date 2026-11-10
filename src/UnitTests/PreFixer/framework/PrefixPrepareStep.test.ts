import type { DomainModels } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { PrefixJobState } from "../../../PreFixer/framework/PrefixJobState";
import { type PrefixPrepareDeps, PrefixPrepareStep } from "../../../PreFixer/framework/PrefixPrepareStep";
import { JobReport } from "../../../shared/rename/JobReport";
import { appDocument, MF, NF, PAGE, treeDocument, treeModule } from "../helpers/fakeModel";

const tree = [
  treeModule("M", [
    treeDocument("mf-1", MF, "ACT_Order_Save"),
    treeDocument("nf-1", NF, "ACT_Order_Show"),
    treeDocument("pg-1", PAGE, "ACT_Order_Edit"),
    treeDocument("mf-2", MF, "SUB_Order_Get"),
    treeDocument("dt-1", "DocumentTemplates$DocumentTemplate", "DT_Order_Print"),
  ]),
  treeModule("Atlas_Core", [treeDocument("mf-3", MF, "ACT_Atlas_Do")], [], true),
  treeModule("System", [], [], true),
];

function deps(overrides: Partial<PrefixPrepareDeps> = {}): PrefixPrepareDeps {
  return {
    getModulesTree: vi.fn(async () => tree),
    loadDomainModels: vi.fn(async () => [{ moduleName: "M", unit: { entities: [{ name: "Order" }] } as unknown as DomainModels.DomainModel }]),
    loadModuleSecurities: vi.fn(async () => []),
    listUnits: vi.fn(async () => new Map([[MF, new Set(["mf-1"])]])),
    scope: { excludedModules: new Set(["System", "Atlas_Core"]) },
    change: { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" },
    state: new PrefixJobState(),
    ...overrides,
  };
}

describe("PrefixPrepareStep", () => {
  it("fills the job state from the tree, the domain models and the listings", async () => {
    const stepDeps = deps();
    const report = new JobReport();
    expect(await new PrefixPrepareStep(stepDeps).run(report)).toBe(true);
    const { state } = stepDeps;
    expect(state.candidates).toEqual([appDocument("mf-1", MF, "ACT_Order_Save"), appDocument("nf-1", NF, "ACT_Order_Show")]);
    expect([...state.marketplaceModules]).toEqual(["Atlas_Core"]);
    expect(state.names.existedAtStart("M", "SUB_Order_Get")).toBe(true);
    expect(state.names.existedAtStart("Atlas_Core", "ACT_Atlas_Do")).toBe(true);
    expect([...state.reservedNames.keys()]).toEqual(["M.Order"]);
    expect(state.listed.get(MF)).toEqual(new Set(["mf-1"]));
    expect(report.documentTemplates).toBe(1);
    expect(report.hasErrors).toBe(false);
  });

  it("finds candidates of the chosen group only", async () => {
    const stepDeps = deps({ change: { group: "pages", oldPrefix: "ACT", newPrefix: null } });
    await new PrefixPrepareStep(stepDeps).run(new JobReport());
    expect(stepDeps.state.candidates.map((d) => d.$ID)).toEqual(["pg-1"]);
  });

  it("stops the job when anything can't be read; nothing is changed yet", async () => {
    const failing = deps({
      listUnits: async () => {
        throw new Error("offline");
      },
    });
    expect(await new PrefixPrepareStep(failing).run(new JobReport())).toBe("Could not prepare the rename: Error: offline");
    const noTree = deps({
      getModulesTree: async () => {
        throw new Error("busy");
      },
    });
    expect(await new PrefixPrepareStep(noTree).run(new JobReport())).toBe("Could not prepare the rename: Error: busy");
    expect(noTree.loadDomainModels).not.toHaveBeenCalled();
  });
});
