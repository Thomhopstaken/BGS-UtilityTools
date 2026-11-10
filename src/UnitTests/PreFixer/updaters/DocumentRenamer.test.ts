import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { PrefixPlan } from "../../../PreFixer/framework/PrefixPlan";
import { DocumentRenamer, type DocumentRenamerSpec } from "../../../PreFixer/updaters/DocumentRenamer";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { ReferenceIndex } from "../../../shared/rename/ReferenceIndex";
import { fakeUnit, fakeUnitAccess, fakeUnitInfo } from "../../shared/helpers/fakes";
import { appDocument, MF, PAGE } from "../helpers/fakeModel";

const save = appDocument("mf-1", MF, "ACT_Order_Save");
const helper = appDocument("mf-2", MF, "ACT_Order_Check");

function setup(spec: Partial<DocumentRenamerSpec> = {}, saved: readonly string[] = []) {
  const plan = new PrefixPlan();
  const renames = new QualifiedNameRenames();
  for (const document of [save, helper]) {
    const newName = document.name.replace("ACT_", "SUB_");
    plan.add(document, newName);
    renames.addDocument("M", document.name, newName, document.$ID);
  }
  const index = new ReferenceIndex();
  const renamer = new DocumentRenamer(
    { unitType: MF, kind: "microflow", label: "Rename microflows", references: {}, ...spec },
    fakeUnitAccess<Primitives.UnitBase>([]),
    { plan, renames, existing: { isSaved: (id) => saved.includes(id), index } },
  );
  return { renamer, plan, index };
}

const flow = (name: string, calls: string[] = []) =>
  fakeUnit(save.$ID, { $Type: MF, name, objectCollection: { $Type: "Microflows$MicroflowObjectCollection", objects: calls.map((microflow) => ({ $Type: "Call", microflow })) } }) as Primitives.UnitBase & {
    name: string;
    objectCollection: { objects: { microflow: string }[] };
  };

describe("DocumentRenamer", () => {
  it("describes its step", () => {
    const { renamer } = setup();
    expect([renamer.label, renamer.title, renamer.description, renamer.unitType, renamer.implemented]).toEqual([
      "Rename microflows",
      "Renaming microflows",
      "Renaming microflows",
      MF,
      true,
    ]);
  });

  it("is idle without planned renames of its type, and accepts only planned units", () => {
    const { renamer } = setup();
    expect(renamer.isIdle()).toBe(false);
    expect(renamer.accepts(fakeUnitInfo("mf-1", MF))).toBe(true);
    expect(renamer.accepts(fakeUnitInfo("mf-9", MF))).toBe(false);
    const { renamer: pages } = setup({ unitType: PAGE });
    expect(pages.isIdle()).toBe(true);
  });

  it("renames the document and rewrites references to its own and saved renames", async () => {
    const { renamer, index } = setup({}, ["mf-2"]);
    const unit = flow("ACT_Order_Save", ["M.ACT_Order_Save", "M.ACT_Order_Check", "M.Other"]);
    const result = await renamer.update(unit, fakeUnitInfo("mf-1", MF, "M", "ACT_Order_Save"));
    expect(unit.name).toBe("SUB_Order_Save");
    expect(unit.objectCollection.objects.map((o) => o.microflow)).toEqual(["M.SUB_Order_Save", "M.SUB_Order_Check", "M.Other"]);
    expect(result).toMatchObject({ changed: true, renamedTo: "SUB_Order_Save", updatedReferences: 2 });
    expect(index.isUpToDate("mf-1")).toBe(true);
  });

  it("leaves references to renames saved later to the reference pass", async () => {
    const { renamer, index } = setup();
    const unit = flow("ACT_Order_Save", ["M.ACT_Order_Check"]);
    const result = await renamer.update(unit, fakeUnitInfo("mf-1", MF, "M", "ACT_Order_Save"));
    expect(unit.objectCollection.objects[0].microflow).toBe("M.ACT_Order_Check");
    expect(result.updatedReferences).toBe(0);
    expect(index.isUpToDate("mf-1")).toBe(false);
  });

  it("only renames a type outside the reference pass", async () => {
    const { renamer, index } = setup({ references: null }, ["mf-2"]);
    const unit = flow("ACT_Order_Save", ["M.ACT_Order_Check"]);
    const result = await renamer.update(unit, fakeUnitInfo("mf-1", MF, "M", "ACT_Order_Save"));
    expect(unit.name).toBe("SUB_Order_Save");
    expect(unit.objectCollection.objects[0].microflow).toBe("M.ACT_Order_Check");
    expect(result.updatedReferences).toBe(0);
    expect(index.isUpToDate("mf-1")).toBe(false);
  });

  it("rewrites only allowed properties", async () => {
    const { renamer } = setup({ references: { onlyProperties: new Set(["name"]) } }, ["mf-2"]);
    const unit = flow("ACT_Order_Save", ["M.ACT_Order_Check"]);
    await renamer.update(unit, fakeUnitInfo("mf-1", MF, "M", "ACT_Order_Save"));
    expect(unit.objectCollection.objects[0].microflow).toBe("M.ACT_Order_Check");
  });

  it("refuses a document renamed since planning", async () => {
    const { renamer } = setup();
    const unit = flow("ACT_Order_Saved");
    await expect(renamer.update(unit, fakeUnitInfo("mf-1", MF))).rejects.toThrow("renamed to ACT_Order_Saved since planning; left as it is");
    expect(unit.name).toBe("ACT_Order_Saved");
  });

  it("leaves an unplanned unit unchanged", async () => {
    const { renamer } = setup();
    const result = await renamer.update(flow("X_Y_Z"), fakeUnitInfo("mf-9", MF));
    expect(result.changed).toBe(false);
  });
});
