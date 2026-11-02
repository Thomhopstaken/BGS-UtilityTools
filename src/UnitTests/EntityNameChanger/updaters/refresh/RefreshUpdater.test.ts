import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import { ReferenceIndex } from "../../../../EntityNameChanger/framework/ReferenceIndex";
import { RenameReport } from "../../../../EntityNameChanger/framework/RenameReport";
import { updateUnit } from "../../../../EntityNameChanger/framework/RenameJob";
import { RefreshUpdater } from "../../../../EntityNameChanger/updaters/refresh/RefreshUpdater";
import { changed, fakeUnit, fakeUnitAccess, fakeUnitInfo } from "../../helpers/fakes";

const PAGE = "Pages$Page";

// Records the documentation at each save; the fake access keeps only references.
function setup() {
  const unit = fakeUnit<Primitives.UnitBase & { documentation?: string }>("p1", { documentation: "Edits an order" });
  const access = fakeUnitAccess([unit]);
  const savedDocs: (string | undefined)[] = [];
  const save = access.save;
  access.save = async (element) => {
    savedDocs.push((element as unknown as { documentation?: string }).documentation);
    await save(element);
  };
  const updater = new RefreshUpdater({ documents: "pages", unitType: PAGE }, access);
  return { unit, access, savedDocs, updater };
}

describe("RefreshUpdater", () => {
  it("has the spec metadata and access", () => {
    const { updater, access } = setup();
    expect(updater).toMatchObject({
      label: "Refresh pages",
      title: "Refreshing pages",
      unitType: PAGE,
      implemented: true,
      description: "Saving changed pages again so Studio Pro re-checks them",
    });
    expect(updater.access).toBe(access);
  });

  it("accepts only units changed earlier in the run", () => {
    const { updater } = setup();
    const report = new RenameReport();
    report.addResult("Pages", fakeUnitInfo("p1", PAGE), changed());
    report.addResult("Pages", fakeUnitInfo("p2", PAGE), { ...changed(), changed: false });
    expect(updater.accepts(fakeUnitInfo("p1", PAGE), report)).toBe(true);
    expect(updater.accepts(fakeUnitInfo("p2", PAGE), report)).toBe(false);
    expect(updater.accepts(fakeUnitInfo("p3", PAGE), report)).toBe(false);
  });

  it("with a filter, accepts only changed units that called a document with renamed parameters", () => {
    const renames = new QualifiedNameRenames();
    renames.add("MyModule.Order", "MyModule.Purchase");
    renames.addParameter("MyModule", "ACT_Save", "ACT_Save", "Order", "Purchase");
    const index = new ReferenceIndex();
    index.add("p-calls", { $Type: PAGE, microflow: "MyModule.ACT_Save", parameter: "MyModule.ACT_Save.Order" });
    index.add("p-entity", { $Type: PAGE, entity: "MyModule.Order" });
    const updater = new RefreshUpdater({ documents: "pages", unitType: PAGE }, fakeUnitAccess([]), { index, renames });
    const report = new RenameReport();
    for (const id of ["p-calls", "p-entity", "p-unindexed"]) {
      report.addResult("References in pages", fakeUnitInfo(id, PAGE), changed());
    }
    expect(["p-calls", "p-entity", "p-unindexed", "p-unchanged"].map((id) => updater.accepts(fakeUnitInfo(id, PAGE), report))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("saves the touched unit, then has the job save it reverted", async () => {
    const { unit, access, savedDocs, updater } = setup();
    const report = new RenameReport();
    await updateUnit(updater, unit, fakeUnitInfo("p1", PAGE), report);
    expect(savedDocs).toEqual(["Edits an order ", "Edits an order"]);
    expect(access.saved).toEqual([unit, unit]);
    expect(unit.documentation).toBe("Edits an order");
    expect(report.updatedReferences).toBe(0);
    expect(report.hasErrors).toBe(false);
  });

  it("treats missing documentation as empty", async () => {
    const { unit, savedDocs, updater } = setup();
    delete unit.documentation;
    expect(await updater.update(unit, fakeUnitInfo("p1", PAGE))).toEqual({
      changed: true,
      renamedTo: null,
      renamedVariables: 0,
      updatedReferences: 0,
      skippedRenames: 0,
      renamedAssociations: 0,
    });
    expect(savedDocs).toEqual([" "]);
    expect(unit.documentation).toBe("");
  });

  it("reverts in memory and fails when the first save fails", async () => {
    const { unit, access, updater } = setup();
    access.save = async () => {
      throw new Error("locked");
    };
    const report = new RenameReport();
    await updateUnit(updater, unit, fakeUnitInfo("p1", PAGE), report);
    expect(unit.documentation).toBe("Edits an order");
    expect(report.failures.map((f) => f.error)).toEqual(["locked"]);
  });
});
