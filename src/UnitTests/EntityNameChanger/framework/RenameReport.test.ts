import { describe, expect, it } from "vitest";
import { changed, fakeUnitInfo } from "../helpers/fakes";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";
import { UNCHANGED } from "../../../EntityNameChanger/framework/types";

describe("RenameReport", () => {
  const info = fakeUnitInfo("u1", "Microflows$Microflow", "MyModule", "ACT_Order");

  it("starts empty", () => {
    const report = new RenameReport();
    expect(report.hasErrors).toBe(false);
    expect(report.summary()).toEqual(["Checked 0 documents, updated 0."]);
  });

  it("counts results and keeps only changed ones", () => {
    const report = new RenameReport();
    report.addResult("Microflows", info, { ...UNCHANGED, skippedRenames: 2 });
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase", skippedRenames: 1 }));
    expect(report.checkedUnits).toBe(2);
    expect(report.skippedRenames).toBe(3);
    expect(report.changed).toEqual([
      { label: "Microflows", unitId: "u1", name: "ACT_Order", result: changed({ renamedTo: "ACT_Purchase", skippedRenames: 1 }) },
    ]);
  });

  it("falls back to the unit id when the info has no name", () => {
    const report = new RenameReport();
    report.addResult("Microflows", { $ID: "u2", $Type: "T" } as never, changed());
    expect(report.changed[0].name).toBe("u2");
  });

  it("records errors with their message", () => {
    const report = new RenameReport();
    report.addError("Microflows", info, new Error("boom"));
    report.addError("Microflows", info, "plain");
    expect(report.hasErrors).toBe(true);
    expect(report.checkedUnits).toBe(2);
    expect(report.failures.map((f) => [f.name, f.error])).toEqual([
      ["MyModule.ACT_Order", "boom"],
      ["MyModule.ACT_Order", "plain"],
    ]);
  });

  it("summarizes every outcome", () => {
    const report = new RenameReport();
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
    report.addResult("Microflows", info, changed());
    report.addResult("Microflows", info, { ...UNCHANGED, skippedRenames: 1 });
    report.addError("Microflows", info, new Error("boom"));
    report.skipEntity("reason");
    expect(report.entitySkipReason).toBe("reason");
    expect(report.summary()).toEqual([
      "Checked 4 documents, updated 2.",
      "Renamed 1 documents.",
      "Skipped 1 renames because the new name is already in use.",
      "Failed: Microflows MyModule.ACT_Order: boom",
      "Entity not renamed: reason",
    ]);
  });
});
