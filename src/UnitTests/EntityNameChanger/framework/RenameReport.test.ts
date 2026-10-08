import { describe, expect, it } from "vitest";
import { changed, fakeUnitInfo } from "../helpers/fakes";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";
import { UNCHANGED } from "../../../EntityNameChanger/framework/types";

describe("RenameReport", () => {
  const info = fakeUnitInfo("u1", "Microflows$Microflow", "MyModule", "ACT_Order");
  const other = fakeUnitInfo("u2", "Microflows$Microflow", "MyModule", "ACT_Customer");
  const third = fakeUnitInfo("u3", "Pages$Page", "MyModule", "Order_Edit");

  it("starts empty", () => {
    const report = new RenameReport();
    expect(report.hasErrors).toBe(false);
    expect(report.summary()).toEqual(["Checked 0 documents, updated 0."]);
  });

  it("counts results and keeps only changed ones", () => {
    const report = new RenameReport();
    report.addResult("Microflows", other, { ...UNCHANGED, skippedRenames: 2 });
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase", skippedRenames: 1 }));
    expect(report.checkedUnits).toBe(2);
    expect(report.changedUnits).toBe(1);
    expect(report.skippedRenames).toBe(3);
    expect(report.changed).toEqual([
      { label: "Microflows", unitId: "u1", name: "ACT_Order", result: changed({ renamedTo: "ACT_Purchase", skippedRenames: 1 }) },
    ]);
  });

  it("counts a unit visited by both passes once", () => {
    const report = new RenameReport();
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
    report.addResult("References in microflows", info, changed({ renamedVariables: 0, updatedReferences: 2 }));
    report.addResult("References in microflows", other, { ...UNCHANGED });
    expect(report.checkedUnits).toBe(2);
    expect(report.changedUnits).toBe(1);
    expect(report.changed).toHaveLength(2);
  });

  it("tells whether a unit was changed", () => {
    const report = new RenameReport();
    report.addResult("Microflows", info, changed());
    report.addResult("Microflows", other, { ...UNCHANGED });
    expect(report.wasChanged("u1")).toBe(true);
    expect(report.wasChanged("u2")).toBe(false);
    expect(report.wasChanged("u3")).toBe(false);
  });

  it("falls back to the unit id when the info has no name", () => {
    const report = new RenameReport();
    report.addResult("Microflows", { $ID: "u2", $Type: "T" } as never, changed());
    expect(report.changed[0].name).toBe("u2");
  });

  it("records errors with their message", () => {
    const report = new RenameReport();
    report.addError("Microflows", info, new Error("boom"));
    report.addError("References in microflows", info, "plain");
    expect(report.hasErrors).toBe(true);
    expect(report.checkedUnits).toBe(1);
    expect(report.failures.map((f) => [f.label, f.name, f.error])).toEqual([
      ["Microflows", "MyModule.ACT_Order", "boom"],
      ["References in microflows", "MyModule.ACT_Order", "plain"],
    ]);
  });

  it("sums updated references", () => {
    const report = new RenameReport();
    report.addResult("Microflows", info, changed({ updatedReferences: 2 }));
    report.addResult("Pages", other, changed({ updatedReferences: 3 }));
    report.addResult("Pages", third, { ...UNCHANGED });
    expect(report.updatedReferences).toBe(5);
  });

  it("reports an incomplete rename", () => {
    const report = new RenameReport();
    report.entityRenamed = true;
    report.markIncomplete("cancelled by user");
    expect(report.incompleteReason).toBe("cancelled by user");
    expect(report.summary()).toEqual(["Checked 0 documents, updated 0.", "Not finished: cancelled by user"]);
  });

  it("summarizes every outcome", () => {
    const report = new RenameReport();
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
    report.addResult("Microflows", other, changed());
    report.addResult("Pages", third, { ...UNCHANGED, skippedRenames: 1 });
    report.addResult("References in microflows", info, changed({ updatedReferences: 4 }));
    report.addError("Microflows", fakeUnitInfo("u4", "Microflows$Microflow", "MyModule", "ACT_Broken"), new Error("boom"));
    report.skipEntity("reason");
    expect(report.entitySkipReason).toBe("reason");
    expect(report.summary()).toEqual([
      "Checked 4 documents, updated 2.",
      "Renamed 1 documents.",
      "Updated 4 references to the renamed entity, documents, parameters and associations.",
      "Skipped 1 renames because the new name is already in use (see the log).",
      "Failed: Microflows MyModule.ACT_Broken: boom",
      "Entity not renamed: reason",
    ]);
  });

  it("sums renamed associations and reports them", () => {
    const report = new RenameReport();
    report.addResult("Associations", fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Other"), changed({ renamedVariables: 0, renamedAssociations: 2 }));
    report.renamedAssociations += 1;
    expect(report.renamedAssociations).toBe(3);
    expect(report.summary()).toContain("Renamed 3 associations.");
    expect(report.navigationWarnings()).toEqual([]);
  });

  describe("navigation warnings", () => {
    const nanoflow = fakeUnitInfo("u5", "Microflows$Nanoflow", "MyModule", "NAV_Order");
    const snippet = fakeUnitInfo("u6", "Pages$Snippet", "MyModule", "Order_Snippet");

    it("is empty when no document was renamed", () => {
      const report = new RenameReport();
      report.addResult("Microflows", info, changed());
      report.addResult("Pages", third, { ...UNCHANGED });
      expect(report.renamedDocuments).toEqual([]);
      expect(report.navigationWarnings()).toEqual([]);
    });

    it("records renamed documents with qualified names", () => {
      const report = new RenameReport();
      report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
      expect(report.renamedDocuments).toEqual([
        { unitType: "Microflows$Microflow", oldQualifiedName: "MyModule.ACT_Order", newQualifiedName: "MyModule.ACT_Purchase" },
      ]);
    });

    it("lists renamed pages, microflows and nanoflows", () => {
      const report = new RenameReport();
      report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
      report.addResult("Nanoflows", nanoflow, changed({ renamedTo: "NAV_Purchase" }));
      report.addResult("Pages", third, changed({ renamedTo: "Purchase_Edit" }));
      const lines = report.navigationWarnings();
      expect(lines[0]).toContain("App > Navigation");
      expect(lines.slice(1)).toEqual([
        "MyModule.ACT_Order -> MyModule.ACT_Purchase",
        "MyModule.NAV_Order -> MyModule.NAV_Purchase",
        "MyModule.Order_Edit -> MyModule.Purchase_Edit",
      ]);
    });

    it("ignores snippets and reference-only changes", () => {
      const report = new RenameReport();
      report.addResult("Snippets", snippet, changed({ renamedTo: "Purchase_Snippet" }));
      report.addResult("References in microflows", other, changed({ updatedReferences: 2 }));
      expect(report.renamedDocuments).toHaveLength(1);
      expect(report.navigationWarnings()).toEqual([]);
    });

    it("skips a unit without a name", () => {
      const report = new RenameReport();
      report.addResult("Pages", { $ID: "u7", $Type: "Pages$Page" } as never, changed({ renamedTo: "Purchase_Edit" }));
      expect(report.navigationWarnings()).toEqual([]);
    });
  });
});
