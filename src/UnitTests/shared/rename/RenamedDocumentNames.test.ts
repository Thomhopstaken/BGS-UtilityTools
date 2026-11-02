import { describe, expect, it } from "vitest";
import type { DocumentRenameOutcome } from "../../../shared/rename/JobReport";
import { RenamedDocumentNames } from "../../../shared/rename/RenamedDocumentNames";

const MF = "Microflows$Microflow";
const renamed = (unitId: string, oldName: string, newName: string): DocumentRenameOutcome => ({
  unitId,
  unitType: MF,
  oldQualifiedName: `M.${oldName}`,
  newQualifiedName: `M.${newName}`,
});
const doc = ($ID: string, name: string) => ({ $ID, $Type: MF, name });

function tree(name1: string, name2 = "Other") {
  return [{ name: "M", fromAppStore: false, documents: [doc("1", name1)], folders: [{ documents: [doc("2", name2)] }] }];
}

describe("RenamedDocumentNames", () => {
  it("leaves the tree as it is without renames", () => {
    const names = new RenamedDocumentNames();
    expect(names.correct(tree("ACT_A"))).toEqual(tree("ACT_A"));
    expect(names.size).toBe(0);
  });

  it("puts the new name over a stale one, in folders too, and keeps the other fields", () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A"), renamed("2", "ACT_B", "SUB_B")]);
    const [module] = names.correct(tree("ACT_A", "ACT_B"));
    expect(module.name).toBe("M");
    expect(module.fromAppStore).toBe(false);
    expect(module.documents).toEqual([doc("1", "SUB_A")]);
    expect(module.folders?.[0].documents).toEqual([doc("2", "SUB_B")]);
  });

  it("does not change the tree it was given", () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A")]);
    const stale = tree("ACT_A");
    names.correct(stale);
    expect(stale).toEqual(tree("ACT_A"));
  });

  it("keeps the first stale name when a document is renamed again", () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A")]);
    names.record([renamed("1", "SUB_A", "XYZ_A")]);
    expect(names.correct(tree("ACT_A"))[0].documents).toEqual([doc("1", "XYZ_A")]);
    expect(names.size).toBe(1);
  });

  it("keeps a tree that caught up, or shows a name renamed by hand since", () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A")]);
    expect(names.correct(tree("SUB_A"))[0].documents).toEqual([doc("1", "SUB_A")]);
    expect(names.correct(tree("Manual_A"))[0].documents).toEqual([doc("1", "Manual_A")]);
  });
});
