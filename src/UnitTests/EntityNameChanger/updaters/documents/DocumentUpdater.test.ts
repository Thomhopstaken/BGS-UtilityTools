import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { DocumentNameRegistry } from "../../../../EntityNameChanger/framework/DocumentNameRegistry";
import { DocumentRenamePlan } from "../../../../EntityNameChanger/framework/DocumentRenamePlan";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import { UNCHANGED, type UpdaterMode } from "../../../../EntityNameChanger/framework/types";
import {
  applyNamedRenames,
  type DocumentInspector,
  DocumentUpdater,
  type DocumentUpdaterDeps,
  type LocalRenames,
  NO_LOCAL_RENAMES,
  planNamedRenames,
} from "../../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import { fakeContext, fakeUnitAccess, fakeUnitInfo } from "../../helpers/fakes";

type Doc = Primitives.UnitBase & { name: string; value?: string };

const context = fakeContext();

// An inspector driven by the test: whether the entity is used, and the local renames.
function fakeInspector(usesEntity: boolean, local: LocalRenames = NO_LOCAL_RENAMES) {
  return {
    usesEntity: vi.fn(() => usesEntity),
    planLocalRenames: vi.fn(() => local),
    apply: vi.fn((doc: Doc, l: LocalRenames) => {
      const newValue = doc.value === undefined ? undefined : l.renames.get(doc.value);
      if (newValue === undefined) {
        return 0;
      }
      doc.value = newValue;
      return 1;
    }),
  } satisfies DocumentInspector<Doc>;
}

function setup(inspector: DocumentInspector<Doc>, documents: string[] = []) {
  const documentNames = new DocumentNameRegistry();
  documents.forEach((name) => documentNames.add("MyModule", name));
  const deps: DocumentUpdaterDeps = {
    naming: new NamingPolicy(context.oldName, context.newName, []),
    documentNames,
    renames: QualifiedNameRenames.forEntity(context),
    plan: new DocumentRenamePlan(),
  };
  const create = (mode: UpdaterMode) =>
    new DocumentUpdater<Doc>(
      { label: "Workflows", unitType: "Workflows$Workflow", kind: "workflow", description: "Testing", mode },
      fakeUnitAccess<Doc>([]),
      inspector,
      deps,
    );
  return { planner: create("plan"), renamer: create("rename"), deps };
}

const doc = (name: string, value?: string): Doc => ({ $ID: "wf-1", $Type: "Workflows$Workflow", name, value }) as unknown as Doc;
const info = (name: string) => fakeUnitInfo("wf-1", "Workflows$Workflow", "MyModule", name);
const parameterRename: LocalRenames = { renames: new Map([["Order", "Purchase"]]), referencedByCallers: true };

describe("DocumentUpdater", () => {
  it("has the spec metadata", () => {
    const { planner } = setup(fakeInspector(true));
    expect(planner).toMatchObject({ label: "Workflows", unitType: "Workflows$Workflow", implemented: true, description: "Testing" });
  });

  it("plans without changing the unit and records the document and caller-visible renames", async () => {
    const inspector = fakeInspector(true, parameterRename);
    const { planner, deps } = setup(inspector, ["WF_Order"]);
    const unit = doc("WF_Order", "Order");
    expect(await planner.update(unit, info(unit.name))).toEqual(UNCHANGED);
    expect(unit).toMatchObject({ name: "WF_Order", value: "Order" });
    expect(inspector.apply).not.toHaveBeenCalled();
    expect(deps.plan.get("wf-1")).toEqual({ renamedTo: "WF_Purchase", skipped: 0 });
    expect(deps.renames.map.get("MyModule.WF_Order")).toBe("MyModule.WF_Purchase");
    expect(deps.renames.map.get("MyModule.WF_Order.Order")).toBe("MyModule.WF_Purchase.Purchase");
    expect(deps.documentNames.isFree("MyModule", "WF_Purchase")).toBe(false);
  });

  it("does not record local renames that callers don't reference", async () => {
    const { planner, deps } = setup(fakeInspector(true, { ...parameterRename, referencedByCallers: false }));
    await planner.update(doc("WF_Process"), info("WF_Process"));
    expect(deps.renames.size).toBe(1);
  });

  it("applies the local renames and the planned document rename", async () => {
    const { planner, renamer } = setup(fakeInspector(true, parameterRename), ["WF_Order"]);
    const unit = doc("WF_Order", "Order");
    await planner.update(unit, info(unit.name));
    expect(await renamer.update(unit, info("WF_Order"))).toEqual({ ...UNCHANGED, changed: true, renamedTo: "WF_Purchase", renamedVariables: 1 });
    expect(unit).toMatchObject({ name: "WF_Purchase", value: "Purchase" });
  });

  it("counts a document rename skipped on a clash", async () => {
    const { planner, renamer } = setup(fakeInspector(true), ["WF_Order", "WF_Purchase"]);
    const unit = doc("WF_Order");
    await planner.update(unit, info(unit.name));
    expect(await renamer.update(unit, info(unit.name))).toEqual({ ...UNCHANGED, skippedRenames: 1 });
    expect(unit.name).toBe("WF_Order");
  });

  it("does not rename a document that does not use the entity", async () => {
    const { planner, renamer } = setup(fakeInspector(false), ["WF_Order"]);
    const unit = doc("WF_Order");
    await planner.update(unit, info(unit.name));
    expect(await renamer.update(unit, info(unit.name))).toEqual(UNCHANGED);
    expect(unit.name).toBe("WF_Order");
  });

  it("does not rename a document using the entity without its name", async () => {
    const { planner, deps } = setup(fakeInspector(true), ["WF_Approve"]);
    await planner.update(doc("WF_Approve"), info("WF_Approve"));
    expect(deps.plan.get("wf-1").renamedTo).toBeNull();
  });

  it("records nothing for a unit without a module", async () => {
    const { planner, deps } = setup(fakeInspector(true, parameterRename));
    await planner.update(doc("WF_Order"), { $ID: "wf-1", $Type: "Workflows$Workflow", name: "WF_Order" } as never);
    expect(deps.renames.size).toBe(1);
    expect(deps.plan.get("wf-1").renamedTo).toBeNull();
  });
});

describe("DocumentUpdater local skips", () => {
  it("adds skipped local renames to the result", async () => {
    const { planner, renamer } = setup(fakeInspector(true, { renames: new Map(), referencedByCallers: false, skipped: 2 }), ["WF_Order"]);
    const unit = doc("WF_Order");
    await planner.update(unit, info(unit.name));
    expect(await renamer.update(unit, info("WF_Order"))).toMatchObject({ changed: true, renamedTo: "WF_Purchase", skippedRenames: 2 });
  });
});

describe("planNamedRenames", () => {
  const naming = new NamingPolicy("Order", "Purchase", ["OrderLine"]);
  const named = (...names: string[]) => names.map((name) => ({ name }));

  it("renames matching elements named after the entity", () => {
    expect(planNamedRenames("test", named("Order", "OrderLine", "Other", "MyOrder"), (e) => e.name !== "MyOrder", naming, true)).toEqual({
      renames: new Map([["Order", "Purchase"]]),
      referencedByCallers: true,
      skipped: 0,
    });
  });

  it("skips a new name taken by a sibling and keeps the other renames", () => {
    expect(planNamedRenames("test", named("Order", "Purchase"), () => true, naming, true)).toEqual({
      renames: new Map(),
      referencedByCallers: false,
      skipped: 1,
    });
    expect(planNamedRenames("test", named("Order", "Purchase", "Order_A"), () => true, naming, false)).toEqual({
      renames: new Map([["Order_A", "Purchase_A"]]),
      referencedByCallers: false,
      skipped: 1,
    });
  });

  it("returns NO_LOCAL_RENAMES when nothing matches", () => {
    expect(planNamedRenames("test", named("Other"), () => true, naming, true)).toBe(NO_LOCAL_RENAMES);
    expect(planNamedRenames("test", named("Order"), () => false, naming, true)).toBe(NO_LOCAL_RENAMES);
  });
});

describe("applyNamedRenames", () => {
  it("renames listed elements and counts them", () => {
    const elements = [{ name: "Order" }, { name: "Other" }];
    expect(applyNamedRenames(elements, { renames: new Map([["Order", "Purchase"]]), referencedByCallers: false })).toBe(1);
    expect(elements.map((e) => e.name)).toEqual(["Purchase", "Other"]);
  });
});

describe("DocumentUpdater exposed names", () => {
  it("reports exposed names renamed and skipped by the inspector", async () => {
    const inspector = { ...fakeInspector(true), exposedNameCounts: vi.fn(() => ({ renamed: 3, skipped: 1 })) };
    const { planner, renamer } = setup(inspector, ["WF_Order"]);
    const unit = doc("WF_Order");
    await planner.update(unit, info(unit.name));
    expect(await renamer.update(unit, info("WF_Order"))).toEqual({
      ...UNCHANGED,
      changed: true,
      renamedTo: "WF_Purchase",
      skippedRenames: 1,
      renamedExposedNames: 3,
    });
  });

  it("leaves renamedExposedNames out for inspectors without exposed names", async () => {
    const { planner, renamer } = setup(fakeInspector(true), ["WF_Order"]);
    const unit = doc("WF_Order");
    await planner.update(unit, info(unit.name));
    expect(await renamer.update(unit, info("WF_Order"))).not.toHaveProperty("renamedExposedNames");
  });
});
