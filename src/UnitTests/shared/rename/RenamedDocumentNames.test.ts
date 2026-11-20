import { describe, expect, it, vi } from "vitest";
import type { DocumentRenameOutcome } from "../../../shared/rename/JobReport";
import { type CurrentNameLoader, RenamedDocumentNames } from "../../../shared/rename/RenamedDocumentNames";

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

describe("RenamedDocumentNames.verify", () => {
  const PAGE = "Pages$Page";
  // The model as it is now: $ID -> name; a missing $ID is a deleted document.
  const model = (names: Record<string, string>): CurrentNameLoader =>
    vi.fn(async (_unitType: string, ids: ReadonlySet<string>) =>
      [...ids].filter((id) => id in names).map(($ID) => ({ $ID, name: names[$ID] })),
    );

  it("loads nothing without renames", async () => {
    const names = new RenamedDocumentNames();
    const load = model({});
    await names.verify(load);
    expect(load).not.toHaveBeenCalled();
  });

  it("drops a reverted rename, so the tree's name shows again", async () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A"), renamed("2", "ACT_B", "SUB_B")]);
    await names.verify(model({ "1": "ACT_A", "2": "SUB_B" }));
    expect(names.size).toBe(1);
    expect(names.correct(tree("ACT_A", "ACT_B"))[0]).toMatchObject({ documents: [doc("1", "ACT_A")], folders: [{ documents: [doc("2", "SUB_B")] }] });
  });

  it("drops a deleted document and takes over a later rename", async () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A"), renamed("2", "ACT_B", "SUB_B")]);
    await names.verify(model({ "1": "Manual_A" }));
    expect(names.size).toBe(1);
    expect(names.correct(tree("ACT_A"))[0].documents).toEqual([doc("1", "Manual_A")]);
  });

  it("loads once per unit type with that type's ids", async () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A"), { ...renamed("2", "POP_A", "SUB_A"), unitType: PAGE }, renamed("3", "ACT_C", "SUB_C")]);
    const load = model({ "1": "SUB_A", "2": "SUB_A", "3": "SUB_C" });
    await names.verify(load);
    expect(vi.mocked(load).mock.calls).toEqual([
      [MF, new Set(["1", "3"])],
      [PAGE, new Set(["2"])],
    ]);
    expect(names.size).toBe(3);
  });

  it("keeps a type that fails to load, checks the others, then throws", async () => {
    const names = new RenamedDocumentNames();
    names.record([renamed("1", "ACT_A", "SUB_A"), { ...renamed("2", "POP_A", "SUB_A"), unitType: PAGE }]);
    const load: CurrentNameLoader = async (unitType, ids) => {
      if (unitType === MF) {
        throw new Error("offline");
      }
      return [...ids].map(($ID) => ({ $ID, name: "POP_A" }));
    };
    await expect(names.verify(load)).rejects.toThrow("could not load Microflows$Microflow: offline");
    expect(names.size).toBe(1);
    expect(names.correct(tree("ACT_A"))[0].documents).toEqual([doc("1", "SUB_A")]);
  });
});
