import { describe, expect, it } from "vitest";
import { JobReport } from "../../../shared/rename/JobReport";
import { UNCHANGED } from "../../../shared/rename/types";
import { changed, fakeUnitInfo } from "../helpers/fakes";

describe("JobReport", () => {
  const info = fakeUnitInfo("u1", "Microflows$Microflow", "MyModule", "ACT_Order");
  const other = fakeUnitInfo("u2", "Microflows$Microflow", "MyModule", "ACT_Customer");
  const third = fakeUnitInfo("u3", "Pages$Page", "MyModule", "Order_Edit");

  it("starts empty", () => {
    const report = new JobReport();
    expect(report.hasErrors).toBe(false);
    expect(report.checkedUnits).toBe(0);
    expect(report.skippedDocuments).toEqual([]);
    expect(report.incompleteReason).toBeNull();
    expect(report.documentTemplates).toBe(0);
  });

  it("counts results and keeps only changed ones", () => {
    const report = new JobReport();
    report.addResult("Microflows", other, { ...UNCHANGED, skippedRenames: 2 });
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase", skippedRenames: 1 }));
    expect(report.checkedUnits).toBe(2);
    expect(report.changedUnits).toBe(1);
    expect(report.skippedRenames).toBe(3);
    expect(report.changed).toEqual([
      { label: "Microflows", unitId: "u1", unitType: "Microflows$Microflow", name: "ACT_Order", qualifiedName: "MyModule.ACT_Order", result: changed({ renamedTo: "ACT_Purchase", skippedRenames: 1 }) },
    ]);
  });

  it("counts a unit visited by both passes once", () => {
    const report = new JobReport();
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
    report.addResult("References in microflows", info, changed({ renamedVariables: 0, updatedReferences: 2 }));
    report.addResult("References in microflows", other, { ...UNCHANGED });
    expect(report.checkedUnits).toBe(2);
    expect(report.changedUnits).toBe(1);
    expect(report.changed).toHaveLength(2);
  });

  it("tells whether a unit was changed", () => {
    const report = new JobReport();
    report.addResult("Microflows", info, changed());
    report.addResult("Microflows", other, { ...UNCHANGED });
    expect(report.wasChanged("u1")).toBe(true);
    expect(report.wasChanged("u2")).toBe(false);
    expect(report.wasChanged("u3")).toBe(false);
  });

  it("falls back to the unit id when the info has no name", () => {
    const report = new JobReport();
    report.addResult("Microflows", { $ID: "u2", $Type: "T" } as never, changed());
    expect(report.changed[0].name).toBe("u2");
    expect(report.changed[0].qualifiedName).toBe("u2");
  });

  it("records errors with their message", () => {
    const report = new JobReport();
    report.addError("Microflows", info, new Error("boom"));
    report.addError("References in microflows", info, "plain");
    expect(report.hasErrors).toBe(true);
    expect(report.checkedUnits).toBe(1);
    expect(report.failures.map((f) => [f.label, f.name, f.error])).toEqual([
      ["Microflows", "MyModule.ACT_Order", "boom"],
      ["References in microflows", "MyModule.ACT_Order", "plain"],
    ]);
  });

  it("sums updated references and renamed associations", () => {
    const report = new JobReport();
    report.addResult("Microflows", info, changed({ updatedReferences: 2 }));
    report.addResult("Pages", other, changed({ updatedReferences: 3, renamedAssociations: 1 }));
    report.addResult("Pages", third, { ...UNCHANGED });
    expect(report.updatedReferences).toBe(5);
    expect(report.renamedAssociations).toBe(1);
  });

  it("keeps the reason a job is incomplete", () => {
    const report = new JobReport();
    report.markIncomplete("cancelled by user");
    expect(report.incompleteReason).toBe("cancelled by user");
  });

  describe("skipped documents", () => {
    it("records the qualified names before and after, and the reason", () => {
      const report = new JobReport();
      report.skipDocument(info, "SUB_Order already exists", "SUB_Order");
      expect(report.skippedDocuments).toEqual([
        { unitId: "u1", unitType: "Microflows$Microflow", qualifiedName: "MyModule.ACT_Order", newQualifiedName: "MyModule.SUB_Order", reason: "SUB_Order already exists" },
      ]);
    });

    it("has no new name when none was decided", () => {
      const report = new JobReport();
      report.skipDocument(third, "no API for Pages$Page");
      expect(report.skippedDocuments[0].newQualifiedName).toBeNull();
    });

    it("counts neither as checked nor as failed", () => {
      const report = new JobReport();
      report.skipDocument(info, "reason");
      expect(report.checkedUnits).toBe(0);
      expect(report.hasErrors).toBe(false);
    });

    it("qualifies a unit without a module by its name", () => {
      const report = new JobReport();
      report.skipDocument({ $ID: "x", $Type: "T", name: "Loose" } as never, "reason", "New");
      expect(report.skippedDocuments[0]).toMatchObject({ qualifiedName: "Loose", newQualifiedName: "New" });
    });
  });

  describe("code actions and datasets to check", () => {
    const java = fakeUnitInfo("j1", "JavaActions$JavaAction", "MyModule", "JA_Order");
    const javaScript = fakeUnitInfo("j2", "JavaScriptActions$JavaScriptAction", "MyModule", "JS_Order");
    const dataSet = fakeUnitInfo("d1", "DataSets$DataSet", "MyModule", "DS_Order");

    it("lists each changed Java and JavaScript action once", () => {
      const report = new JobReport();
      report.addResult("Java actions", java, changed({ renamedTo: "JA_Purchase" }));
      report.addResult("References in Java actions", java, changed({ renamedVariables: 0, updatedReferences: 1 }));
      report.addResult("References in JavaScript actions", javaScript, changed({ renamedVariables: 0, updatedReferences: 1 }));
      report.addResult("Java actions", fakeUnitInfo("j3", "JavaActions$JavaAction", "MyModule", "JA_Other"), { ...UNCHANGED });
      report.addResult("Microflows", info, changed());
      expect(report.changedCodeActions()).toEqual(["MyModule.JA_Order", "MyModule.JS_Order"]);
    });

    it("lists renamed datasets only", () => {
      const report = new JobReport();
      report.addResult("Datasets", dataSet, changed({ renamedTo: "DS_Purchase" }));
      report.addResult("Datasets", fakeUnitInfo("d2", "DataSets$DataSet", "MyModule", "DS_Keep"), changed());
      report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
      expect(report.renamedDataSets()).toEqual([
        { unitId: "d1", unitType: "DataSets$DataSet", oldQualifiedName: "MyModule.DS_Order", newQualifiedName: "MyModule.DS_Purchase" },
      ]);
    });

    it("lists renamed documents of the given types", () => {
      const report = new JobReport();
      report.addResult("Datasets", dataSet, changed({ renamedTo: "DS_Purchase" }));
      report.addResult("Java actions", java, changed({ renamedTo: "JA_Purchase" }));
      report.addResult("Microflows", info, changed());
      expect(report.renamedOfTypes(new Set(["JavaActions$JavaAction", "Microflows$Microflow"])).map((d) => d.newQualifiedName)).toEqual([
        "MyModule.JA_Purchase",
      ]);
      expect(report.renamedOfTypes(new Set())).toEqual([]);
    });
  });

  describe("navigation warnings", () => {
    const nanoflow = fakeUnitInfo("u5", "Microflows$Nanoflow", "MyModule", "NAV_Order");
    const snippet = fakeUnitInfo("u6", "Pages$Snippet", "MyModule", "Order_Snippet");

    it("is empty when no document was renamed", () => {
      const report = new JobReport();
      report.addResult("Microflows", info, changed());
      report.addResult("Pages", third, { ...UNCHANGED });
      expect(report.renamedDocuments).toEqual([]);
      expect(report.navigationWarnings()).toEqual([]);
    });

    it("records renamed documents with qualified names", () => {
      const report = new JobReport();
      report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
      expect(report.renamedDocuments).toEqual([
        { unitId: "u1", unitType: "Microflows$Microflow", oldQualifiedName: "MyModule.ACT_Order", newQualifiedName: "MyModule.ACT_Purchase" },
      ]);
    });

    it("lists renamed pages, microflows and nanoflows", () => {
      const report = new JobReport();
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
      const report = new JobReport();
      report.addResult("Snippets", snippet, changed({ renamedTo: "Purchase_Snippet" }));
      report.addResult("References in microflows", other, changed({ updatedReferences: 2 }));
      expect(report.renamedDocuments).toHaveLength(1);
      expect(report.navigationWarnings()).toEqual([]);
      expect(report.navigationDocuments()).toEqual([]);
    });

    it("returns the renamed navigation documents as data", () => {
      const report = new JobReport();
      report.addResult("Nanoflows", nanoflow, changed({ renamedTo: "NAV_Purchase" }));
      report.addResult("Snippets", snippet, changed({ renamedTo: "Purchase_Snippet" }));
      expect(report.navigationDocuments()).toEqual([
        { unitId: "u5", unitType: "Microflows$Nanoflow", oldQualifiedName: "MyModule.NAV_Order", newQualifiedName: "MyModule.NAV_Purchase" },
      ]);
    });

    it("qualifies changed units with their module", () => {
      const report = new JobReport();
      report.addResult("Nanoflows", nanoflow, changed());
      expect(report.changed[0].qualifiedName).toBe("MyModule.NAV_Order");
    });

    it("skips a unit without a name", () => {
      const report = new JobReport();
      report.addResult("Pages", { $ID: "u7", $Type: "Pages$Page" } as never, changed({ renamedTo: "Purchase_Edit" }));
      expect(report.navigationWarnings()).toEqual([]);
    });
  });
});

describe("JobReport.changedApis", () => {
  it("lists each published service with renamed exposed names once", () => {
    const report = new JobReport();
    const service = fakeUnitInfo("s1", "ODataPublish$PublishedODataService2", "MyModule", "POS_Order");
    report.addResult("Published OData services", service, changed({ renamedVariables: 0, renamedExposedNames: 2 }));
    report.addResult("References in published OData services", service, changed({ renamedVariables: 0, updatedReferences: 1 }));
    report.addResult("Published REST services", fakeUnitInfo("s2", "Rest$PublishedRestService", "MyModule", "PRS_Order"), changed({ renamedExposedNames: 0 }));
    expect(report.changedApis()).toEqual(["MyModule.POS_Order"]);
  });
});
