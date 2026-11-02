import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";
import {
  buildOutcome,
  buildRunLog,
  changeNote,
  countLabel,
  countRows,
  isOpenByDefault,
  onlyProblems,
  type RunLog,
  runLogMeta,
  unitTypeName,
} from "../../../EntityNameChanger/ui/runLog";
import { changed, fakeContext, fakeUnitInfo } from "../helpers/fakes";

const context = fakeContext();
const success = { result: "Success" } as ProgressDialogResult;
const cancelled = { result: "UserCancelled" } as ProgressDialogResult;
const failure = { result: "Failure", failedStep: { stepTitle: "Updating microflows", error: "boom" } } as ProgressDialogResult;

const flow = fakeUnitInfo("u1", "Microflows$Microflow", "MyModule", "ACT_Order_Save");
const page = fakeUnitInfo("u2", "Pages$Page", "MyModule", "Order_Edit");
const other = fakeUnitInfo("u3", "Microflows$Microflow", "MyModule", "ACT_Customer");

function renamedReport(): RenameReport {
  const report = new RenameReport();
  report.entityRenamed = true;
  return report;
}

const titles = (log: RunLog) => log.groups.map((g) => g.title);

describe("buildOutcome", () => {
  it("reports a clean rename as success", () => {
    expect(buildOutcome(success, renamedReport(), context)).toEqual({ tone: "success", text: "MyModule.Order renamed to MyModule.Purchase." });
  });

  it("warns when the entity was renamed but documents failed", () => {
    const report = renamedReport();
    report.addError("Microflows", flow, new Error("bad"));
    expect(buildOutcome(success, report, context)).toEqual({
      tone: "warning",
      text: "MyModule.Order renamed to MyModule.Purchase, but 1 document failed to update. See the run log.",
    });
  });

  it("reports failed documents that stopped the entity rename as error", () => {
    const report = new RenameReport();
    report.addError("Microflows (plan)", flow, "bad");
    report.addError("Pages (plan)", page, "bad");
    report.skipEntity("2 documents failed");
    expect(buildOutcome(success, report, context)).toEqual({
      tone: "error",
      text: "2 documents failed to update, so MyModule.Order was not renamed. See the run log.",
    });
  });

  it("warns with the skip reason when the entity was not renamed without failures", () => {
    const report = new RenameReport();
    report.skipEntity("name taken");
    expect(buildOutcome(success, report, context)).toEqual({ tone: "warning", text: "MyModule.Order was not renamed: name taken" });
  });

  it("falls back to an unknown reason", () => {
    expect(buildOutcome(success, new RenameReport(), context).text).toBe("MyModule.Order was not renamed: unknown reason");
  });

  it("tells whether a cancel changed anything", () => {
    expect(buildOutcome(cancelled, new RenameReport(), context)).toEqual({ tone: "warning", text: "Rename cancelled; nothing was changed." });
    expect(buildOutcome(cancelled, renamedReport(), context)).toEqual({
      tone: "warning",
      text: "Rename cancelled after the entity was renamed; documents updated so far are kept.",
    });
  });

  it("names the failed step", () => {
    expect(buildOutcome(failure, new RenameReport(), context)).toEqual({ tone: "error", text: "Rename failed at 'Updating microflows': boom" });
  });
});

describe("buildRunLog", () => {
  it("shows only the entity group for an empty run", () => {
    const log = buildRunLog(success, renamedReport(), context);
    expect(log.groups).toEqual([
      { title: "Entity", rows: [{ tone: "success", what: "MyModule.Order → MyModule.Purchase", note: undefined, target: { documentId: "dm-1", elementId: "entity-1" } }] },
    ]);
  });

  it("marks an incomplete entity rename as warning", () => {
    const report = renamedReport();
    report.markIncomplete("cancelled by user");
    expect(buildRunLog(cancelled, report, context).groups[0].rows[0]).toEqual({
      tone: "warning",
      what: "MyModule.Order → MyModule.Purchase",
      note: "cancelled by user",
      target: { documentId: "dm-1", elementId: "entity-1" },
    });
  });

  it("marks a skipped entity as error when documents failed, else as warning", () => {
    const failed = new RenameReport();
    failed.addError("Microflows", flow, "bad");
    failed.skipEntity("documents failed");
    expect(buildRunLog(success, failed, context).groups[0].rows[0]).toMatchObject({ tone: "error", note: "Not renamed: documents failed" });
    const skipped = new RenameReport();
    skipped.skipEntity("cancelled by user; nothing was changed");
    expect(buildRunLog(cancelled, skipped, context).groups[0].rows[0]).toMatchObject({ tone: "warning" });
  });

  it("lists failures, renamed and updated documents, skips and navigation in order", () => {
    const report = renamedReport();
    report.addError("Pages", page, new Error("cannot load"));
    report.addResult("Microflows", flow, changed({ renamedTo: "ACT_Purchase_Save", renamedVariables: 2, skippedRenames: 1 }));
    report.addResult("References in microflows", flow, changed({ renamedVariables: 0, updatedReferences: 4 }));
    report.addResult("Associations", fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Other", "DomainModel"), changed({ renamedVariables: 0, renamedAssociations: 1 }));
    const log = buildRunLog(success, report, context);
    expect(titles(log)).toEqual(["Entity", "Failed documents", "Renamed documents", "Updated documents", "Skipped renames", "Navigation"]);
    expect(log.groups[1].rows).toEqual([{ tone: "error", what: "MyModule.Order_Edit", note: "Pages: cannot load", target: { documentId: "u2" } }]);
    expect(log.groups[2].rows).toEqual([
      { tone: "success", what: "MyModule.ACT_Order_Save → MyModule.ACT_Purchase_Save", note: "Microflow", target: { documentId: "u1" } },
    ]);
    expect(log.groups[3].rows).toEqual([
      { tone: "success", what: "MyModule.ACT_Order_Save", note: "2 variables, 4 references", target: { documentId: "u1" } },
      { tone: "success", what: "Other.DomainModel", note: "1 association", target: { documentId: "dm-2" } },
    ]);
    expect(log.groups[4].rows).toEqual([{ tone: "warning", what: "1 rename skipped", note: "The new name is already in use; see the Studio Pro log." }]);
    expect(log.groups[5].rows).toEqual([
      {
        tone: "warning",
        what: "Check App > Navigation",
        note: "1 renamed document may be used by menu items, home pages or the login page; these are not updated.",
      },
    ]);
  });

  it("gives one navigation warning for several renamed documents", () => {
    const report = renamedReport();
    report.addResult("Microflows", flow, changed({ renamedTo: "ACT_Purchase_Save" }));
    report.addResult("Pages", page, changed({ renamedTo: "Purchase_Edit" }));
    report.addResult("Pages", fakeUnitInfo("u4", "Pages$Page", "MyModule", "Order_Overview"), changed({ renamedTo: "Purchase_Overview" }));
    const navigation = buildRunLog(success, report, context).groups.find((g) => g.title === "Navigation");
    expect(navigation?.rows).toEqual([
      {
        tone: "warning",
        what: "Check App > Navigation",
        note: "3 renamed documents may be used by menu items, home pages or the login page; these are not updated.",
      },
    ]);
  });

  it("has no navigation group without renamed navigation documents", () => {
    const report = renamedReport();
    report.addResult("Snippets", fakeUnitInfo("u5", "Pages$Snippet", "MyModule", "Order_Snippet"), changed({ renamedTo: "Purchase_Snippet" }));
    expect(titles(buildRunLog(success, report, context))).not.toContain("Navigation");
  });

  it("gives warning rows without a document no target", () => {
    const report = renamedReport();
    report.addResult("Microflows", flow, changed({ renamedTo: "ACT_Purchase_Save", skippedRenames: 1 }));
    const log = buildRunLog(success, report, context);
    for (const title of ["Skipped renames", "Navigation"]) {
      expect(log.groups.find((g) => g.title === title)?.rows.every((r) => r.target === undefined)).toBe(true);
    }
  });

  it("keeps targets when only problems are shown", () => {
    const report = renamedReport();
    report.addError("Pages", page, "bad");
    expect(onlyProblems(buildRunLog(success, report, context).groups)[0].rows[0].target).toEqual({ documentId: "u2" });
  });

  it("warns to check code for changed actions and report widgets for renamed datasets", () => {
    const report = renamedReport();
    report.addResult("Java actions", fakeUnitInfo("j1", "JavaActions$JavaAction", "MyModule", "JA_Order"), changed({ renamedTo: "JA_Purchase" }));
    report.addResult("References in JavaScript actions", fakeUnitInfo("j2", "JavaScriptActions$JavaScriptAction", "MyModule", "JS_Order"), changed({ updatedReferences: 1 }));
    report.addResult("Datasets", fakeUnitInfo("d1", "DataSets$DataSet", "MyModule", "DS_Order"), changed({ renamedTo: "DS_Purchase" }));
    const log = buildRunLog(success, report, context);
    expect(titles(log).at(-1)).toBe("Code and reports");
    expect(log.groups.find((g) => g.title === "Code and reports")?.rows).toEqual([
      { tone: "warning", what: "Check javasource and javascriptsource", note: "2 changed Java or JavaScript actions; their code is not updated." },
      { tone: "warning", what: "Check report widgets", note: "1 renamed dataset may be used by report widgets; these are not updated." },
    ]);
  });

  it("uses singular and plural in the code and reports warnings", () => {
    const report = renamedReport();
    report.addResult("Java actions", fakeUnitInfo("j1", "JavaActions$JavaAction", "MyModule", "JA_Order"), changed());
    report.addResult("Datasets", fakeUnitInfo("d1", "DataSets$DataSet", "MyModule", "DS_Order"), changed({ renamedTo: "DS_Purchase" }));
    report.addResult("Datasets", fakeUnitInfo("d2", "DataSets$DataSet", "MyModule", "DS_Order2"), changed({ renamedTo: "DS_Purchase2" }));
    expect(buildRunLog(success, report, context).groups.find((g) => g.title === "Code and reports")?.rows.map((r) => r.note)).toEqual([
      "1 changed Java or JavaScript action; their code is not updated.",
      "2 renamed datasets may be used by report widgets; these are not updated.",
    ]);
  });

  it("warns per changed message definition used by mappings, opening the definition", () => {
    const report = renamedReport();
    report.messageDefinitionUsage.add("MyModule.MD_Order", "MyModule.IMM_Order");
    report.messageDefinitionUsage.add("MyModule.MD_Order", "MyModule.EMM_Order");
    report.messageDefinitionUsage.addEntityDefinition("MyModule.MD_Order");
    report.addResult("References in message definition documents", fakeUnitInfo("m1", "MessageDefinitions$MessageDefinition2", "MyModule", "MD_Order"), changed({ updatedReferences: 1 }));
    const group = buildRunLog(success, report, context).groups.find((g) => g.title === "Message definitions");
    expect(group?.rows).toEqual([
      {
        tone: "warning",
        what: "MyModule.MD_Order",
        note: "Used by MyModule.EMM_Order, MyModule.IMM_Order. These mappings no longer match the changed schema; updating them in Studio Pro clears them, so they must be mapped again by hand.",
        target: { documentId: "m1" },
      },
    ]);
  });

  it("has no message definition group when no used definition changed", () => {
    const report = renamedReport();
    report.messageDefinitionUsage.add("MyModule.MD_Order", "MyModule.IMM_Order");
    report.messageDefinitionUsage.addEntityDefinition("MyModule.MD_Order");
    report.addResult("Message definitions", fakeUnitInfo("m1", "MessageDefinitions$MessageDefinitionCollection", "MyModule", "MD_Other"), changed());
    expect(titles(buildRunLog(success, report, context))).not.toContain("Message definitions");
  });

  it("warns to check API clients of services with renamed exposed names, first in its group", () => {
    const report = renamedReport();
    const service = fakeUnitInfo("s1", "ODataPublish$PublishedODataService2", "MyModule", "POS_Order");
    report.addResult("Published OData services", service, changed({ renamedVariables: 0, renamedTo: "POS_Purchase", renamedExposedNames: 2 }));
    report.addResult("Datasets", fakeUnitInfo("d1", "DataSets$DataSet", "MyModule", "DS_Order"), changed({ renamedTo: "DS_Purchase" }));
    const log = buildRunLog(success, report, context);
    expect(log.groups.find((g) => g.title === "Code and reports")?.rows[0]).toEqual({
      tone: "warning",
      what: "Check API clients",
      note: "1 published service has renamed exposed names; their clients must be updated.",
    });
    expect(log.groups.find((g) => g.title === "Updated documents")?.rows).toContainEqual({
      tone: "success",
      what: "MyModule.POS_Order",
      note: "2 exposed names",
      target: { documentId: "s1" },
    });
  });

  it("warns about document templates after a rename when the app has any", () => {
    const report = renamedReport();
    report.documentTemplates = 3;
    expect(buildRunLog(success, report, context).groups.find((g) => g.title === "Code and reports")?.rows).toEqual([
      { tone: "warning", what: "Check document templates", note: "3 document templates are deprecated and not updated." },
    ]);
    report.documentTemplates = 1;
    expect(buildRunLog(success, report, context).groups.at(-1)?.rows[0].note).toBe("1 document template is deprecated and not updated.");
  });

  it("warns about document templates when they could not be listed", () => {
    const report = renamedReport();
    report.documentTemplates = null;
    expect(buildRunLog(success, report, context).groups.at(-1)?.rows[0].note).toBe(
      "Document templates could not be listed; they are deprecated and not updated.",
    );
  });

  it("does not warn about document templates without a rename or without templates", () => {
    const notRenamed = new RenameReport();
    notRenamed.documentTemplates = 3;
    expect(titles(buildRunLog(cancelled, notRenamed, context))).not.toContain("Code and reports");
    expect(titles(buildRunLog(success, renamedReport(), context))).not.toContain("Code and reports");
  });

  it("has no code and reports group without changed actions or renamed datasets", () => {
    const report = renamedReport();
    report.addResult("Datasets", fakeUnitInfo("d1", "DataSets$DataSet", "MyModule", "DS_Order"), changed());
    expect(titles(buildRunLog(success, report, context))).not.toContain("Code and reports");
  });

  it("leaves out units changed without counts, such as refresh saves", () => {
    const report = renamedReport();
    report.addResult("Refresh pages", other, changed({ renamedVariables: 0 }));
    expect(titles(buildRunLog(success, report, context))).toEqual(["Entity"]);
  });
});

describe("changeNote", () => {
  it("joins non-zero counts with plurals", () => {
    expect(changeNote(1, 2, 0)).toBe("1 variable, 2 references");
    expect(changeNote(0, 1, 3)).toBe("1 reference, 3 associations");
    expect(changeNote(0, 0, 0)).toBeNull();
  });

  it("counts exposed names", () => {
    expect(changeNote(0, 1, 0, 1)).toBe("1 reference, 1 exposed name");
    expect(changeNote(0, 0, 0, 3)).toBe("3 exposed names");
  });
});

describe("unitTypeName", () => {
  it.each([
    ["Microflows$Microflow", "Microflow"],
    ["Pages$Snippet", "Snippet"],
    ["Plain", "Plain"],
    ["Odd$", "Odd$"],
  ])("%s -> %s", (type, name) => {
    expect(unitTypeName(type)).toBe(name);
  });
});

describe("counts and filters", () => {
  const log: RunLog = {
    outcome: { tone: "warning", text: "x" },
    groups: [
      { title: "A", rows: [{ tone: "success", what: "a1" }, { tone: "warning", what: "a2" }] },
      { title: "B", rows: [{ tone: "success", what: "b1" }] },
      { title: "C", rows: [{ tone: "error", what: "c1" }, { tone: "error", what: "c2" }] },
    ],
  };

  it("counts rows per tone", () => {
    expect(countRows(log)).toEqual({ success: 2, warning: 1, error: 2 });
  });

  it("keeps problem rows and drops empty groups", () => {
    expect(onlyProblems(log.groups)).toEqual([
      { title: "A", rows: [{ tone: "warning", what: "a2" }] },
      { title: "C", rows: [{ tone: "error", what: "c1" }, { tone: "error", what: "c2" }] },
    ]);
  });

  it("opens groups with problems only", () => {
    expect(log.groups.map(isOpenByDefault)).toEqual([true, false, true]);
  });

  it("labels the counts", () => {
    expect(countLabel("success", 3)).toBe("3 updated");
    expect(countLabel("warning", 1)).toBe("1 warning");
    expect(countLabel("warning", 2)).toBe("2 warnings");
    expect(countLabel("error", 0)).toBe("0 failed");
  });
});

describe("runLogMeta", () => {
  it("shows the end time and the duration", () => {
    expect(runLogMeta(new Date(2026, 9, 9, 14, 2, 8, 600), new Date(2026, 9, 9, 14, 2, 11, 950))).toBe("14:02:11 · 3.4 s");
  });

  it("never shows a negative duration", () => {
    expect(runLogMeta(new Date(2026, 9, 9, 9, 5, 7), new Date(2026, 9, 9, 9, 5, 6))).toBe("09:05:06 · 0.0 s");
  });
});
