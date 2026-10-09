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
    expect(log.groups).toEqual([{ title: "Entity", rows: [{ tone: "success", what: "MyModule.Order → MyModule.Purchase", note: undefined }] }]);
  });

  it("marks an incomplete entity rename as warning", () => {
    const report = renamedReport();
    report.markIncomplete("cancelled by user");
    expect(buildRunLog(cancelled, report, context).groups[0].rows[0]).toEqual({
      tone: "warning",
      what: "MyModule.Order → MyModule.Purchase",
      note: "cancelled by user",
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
    expect(log.groups[1].rows).toEqual([{ tone: "error", what: "MyModule.Order_Edit", note: "Pages: cannot load" }]);
    expect(log.groups[2].rows).toEqual([{ tone: "success", what: "MyModule.ACT_Order_Save → MyModule.ACT_Purchase_Save", note: "Microflow" }]);
    expect(log.groups[3].rows).toEqual([
      { tone: "success", what: "MyModule.ACT_Order_Save", note: "2 variables, 4 references" },
      { tone: "success", what: "Other.DomainModel", note: "1 association" },
    ]);
    expect(log.groups[4].rows).toEqual([{ tone: "warning", what: "1 rename skipped", note: "The new name is already in use; see the Studio Pro log." }]);
    expect(log.groups[5].rows).toEqual([
      {
        tone: "warning",
        what: "MyModule.ACT_Order_Save → MyModule.ACT_Purchase_Save",
        note: "Check App > Navigation: menu items, home pages and the login page are not updated.",
      },
    ]);
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
