import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { buildPrefixOutcome, buildPrefixRunLog, checkYourselfGroup } from "../../../PreFixer/ui/runLog";
import { JobReport } from "../../../shared/rename/JobReport";
import { changed, fakeUnitInfo } from "../../shared/helpers/fakes";
import { CONSTANT, MF, NF, PAGE } from "../helpers/fakeModel";

const change = { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" };
const success = { result: "Success" } as ProgressDialogResult;
const cancelled = { result: "UserCancelled" } as ProgressDialogResult;
const failure = { result: "Failure", failedStep: { stepTitle: "Preparing", error: "offline" } } as ProgressDialogResult;

function renamed(report: JobReport, id: string, type: string, name: string, newName = name.replace("ACT_", "SUB_")): void {
  report.addResult("Rename", fakeUnitInfo(id, type, "M", name), changed({ renamedVariables: 0, renamedTo: newName }));
}

describe("buildPrefixOutcome", () => {
  it("reports a clean run as success", () => {
    const report = new JobReport();
    renamed(report, "a", MF, "ACT_Order_Save");
    renamed(report, "b", NF, "ACT_Order_Show");
    expect(buildPrefixOutcome(success, report, change)).toEqual({ tone: "success", text: "Renamed 2 documents (ACT_ → SUB_)." });
  });

  it("says when nothing had the prefix", () => {
    expect(buildPrefixOutcome(success, new JobReport(), change)).toEqual({ tone: "info", text: "No documents with prefix ACT_ found." });
  });

  it("warns about skipped documents", () => {
    const report = new JobReport();
    report.skipDocument(fakeUnitInfo("x", MF, "M", "ACT_X_Y"), "taken");
    expect(buildPrefixOutcome(success, report, change)).toEqual({ tone: "warning", text: "Nothing renamed: 1 document skipped. See the run log." });
    renamed(report, "a", MF, "ACT_Order_Save");
    expect(buildPrefixOutcome(success, report, { ...change, newPrefix: null })).toEqual({
      tone: "warning",
      text: "Renamed 1 document (remove ACT_); 1 document skipped. See the run log.",
    });
  });

  it("warns about failures after renames, and errors when nothing was renamed", () => {
    const report = new JobReport();
    report.addError("Rename", fakeUnitInfo("f", MF), "boom");
    expect(buildPrefixOutcome(success, report, change)).toEqual({ tone: "error", text: "1 document failed; nothing was renamed. See the run log." });
    renamed(report, "a", MF, "ACT_Order_Save");
    expect(buildPrefixOutcome(success, report, change)).toEqual({
      tone: "warning",
      text: "Renamed 1 document (ACT_ → SUB_), but 1 document failed. See the run log.",
    });
  });

  it("tells whether a cancel changed anything", () => {
    expect(buildPrefixOutcome(cancelled, new JobReport(), change)).toEqual({ tone: "warning", text: "Cancelled; nothing was changed." });
    const report = new JobReport();
    renamed(report, "a", MF, "ACT_Order_Save");
    expect(buildPrefixOutcome(cancelled, report, change).text).toBe("Cancelled after renaming 1 document; they keep their new names. See the run log.");
  });

  it("names the failed step", () => {
    expect(buildPrefixOutcome(failure, new JobReport(), change)).toEqual({ tone: "error", text: "Rename failed at 'Preparing': offline" });
  });
});

describe("checkYourselfGroup", () => {
  it("has one row per risk of the renamed documents, counted over their types", () => {
    const report = new JobReport();
    renamed(report, "a", MF, "ACT_Order_Save");
    renamed(report, "b", NF, "ACT_Order_Show");
    renamed(report, "c", PAGE, "ACT_Order_Edit");
    const group = checkYourselfGroup(report);
    expect(group.title).toBe("Check yourself");
    expect(group.rows.map((r) => [r.tone, r.what])).toEqual([
      ["warning", "Check App > Navigation"],
      ["warning", "Check App > Settings"],
      ["warning", "Check Java code"],
    ]);
    expect(group.rows[0].note).toBe("3 renamed documents may be used by menu items, home pages or the login page; these are not updated.");
    expect(group.rows[1].note).toContain("1 renamed microflow may be the after startup");
  });

  it("warns about constant values and Java proxies for constants", () => {
    const report = new JobReport();
    renamed(report, "k", CONSTANT, "CON_Api_Url");
    expect(checkYourselfGroup(report).rows.map((r) => r.what)).toEqual(["Check constant values", "Check Java code"]);
  });

  it("is empty for types without risks and for reference-only changes", () => {
    const report = new JobReport();
    renamed(report, "s", "Pages$Snippet", "ACT_Order_Part");
    report.addResult("References in pages", fakeUnitInfo("p", PAGE), changed({ renamedVariables: 0, updatedReferences: 1 }));
    expect(checkYourselfGroup(report).rows).toEqual([]);
  });

  it("warns about document templates only after renames", () => {
    const report = new JobReport();
    report.documentTemplates = 2;
    expect(checkYourselfGroup(report).rows).toEqual([]);
    renamed(report, "s", "Pages$Snippet", "ACT_Order_Part");
    expect(checkYourselfGroup(report).rows).toEqual([
      { tone: "warning", what: "Check document templates", note: "2 document templates are deprecated and not updated." },
    ]);
    report.documentTemplates = null;
    expect(checkYourselfGroup(report).rows[0].note).toBe("Document templates could not be listed; they are deprecated and not updated.");
  });
});

describe("buildPrefixRunLog", () => {
  it("lists failed, skipped, renamed, updated and check rows in order, dropping empty groups", () => {
    const report = new JobReport();
    report.addError("Rename", fakeUnitInfo("f", MF, "M", "ACT_Broken_X"), "boom");
    report.skipDocument(fakeUnitInfo("s", MF, "M", "ACT_Taken_X"), "M.SUB_Taken_X already exists", "SUB_Taken_X");
    renamed(report, "a", MF, "ACT_Order_Save");
    report.addResult("References in pages", fakeUnitInfo("p", PAGE, "M", "POP_Order"), changed({ renamedVariables: 0, updatedReferences: 2 }));
    const log = buildPrefixRunLog(success, report, change);
    expect(log.groups.map((g) => g.title)).toEqual(["Failed documents", "Skipped documents", "Renamed documents", "Updated documents", "Check yourself"]);
    expect(log.outcome.tone).toBe("warning");
    expect(buildPrefixRunLog(success, new JobReport(), change).groups).toEqual([]);
  });
});
