import { describe, expect, it } from "vitest";
import { JobReport } from "../../../shared/rename/JobReport";
import { JobTimings } from "../../../shared/rename/JobTimings";
import {
  changeNote,
  failedGroup,
  plural,
  renamedGroup,
  skippedDocumentsGroup,
  timingsGroup,
  unitTypeName,
  updatedGroup,
} from "../../../shared/rename/runLogGroups";
import { UNCHANGED } from "../../../shared/rename/types";
import { changed, fakeUnitInfo } from "../helpers/fakes";

const flow = fakeUnitInfo("u1", "Microflows$Microflow", "MyModule", "ACT_Order_Save");
const page = fakeUnitInfo("u2", "Pages$Page", "MyModule", "POP_Order_Edit");

describe("failedGroup", () => {
  it("has one error row per failure, opening the document", () => {
    const report = new JobReport();
    report.addError("Microflows", flow, new Error("bad"));
    expect(failedGroup(report)).toEqual({
      title: "Failed documents",
      rows: [{ tone: "error", what: "MyModule.ACT_Order_Save", note: "Microflows: bad", target: { documentId: "u1" } }],
    });
  });
});

describe("skippedDocumentsGroup", () => {
  it("has one warning per skipped document with its type and reason", () => {
    const report = new JobReport();
    report.skipDocument(flow, "SUB_Order_Save already exists", "SUB_Order_Save");
    report.skipDocument(page, "no API for this document type");
    expect(skippedDocumentsGroup(report)).toEqual({
      title: "Skipped documents",
      rows: [
        {
          tone: "warning",
          what: "MyModule.ACT_Order_Save → MyModule.SUB_Order_Save",
          note: "Microflow: SUB_Order_Save already exists",
          target: { documentId: "u1" },
        },
        { tone: "warning", what: "MyModule.POP_Order_Edit", note: "Page: no API for this document type", target: { documentId: "u2" } },
      ],
    });
  });

  it("is empty without skipped documents", () => {
    expect(skippedDocumentsGroup(new JobReport()).rows).toEqual([]);
  });
});

describe("renamedGroup", () => {
  it("has one success row per renamed document", () => {
    const report = new JobReport();
    report.addResult("Microflows", flow, changed({ renamedTo: "SUB_Order_Save" }));
    report.addResult("Pages", page, changed());
    expect(renamedGroup(report).rows).toEqual([
      { tone: "success", what: "MyModule.ACT_Order_Save → MyModule.SUB_Order_Save", note: "Microflow", target: { documentId: "u1" } },
    ]);
  });
});

describe("updatedGroup", () => {
  it("merges the passes of one unit and leaves out units without counts", () => {
    const report = new JobReport();
    report.addResult("Microflows", flow, changed({ renamedVariables: 2 }));
    report.addResult("References in microflows", flow, changed({ renamedVariables: 0, updatedReferences: 3 }));
    report.addResult("Refresh pages", page, changed({ renamedVariables: 0 }));
    report.addResult("Pages", fakeUnitInfo("u3", "Pages$Page"), { ...UNCHANGED });
    expect(updatedGroup(report).rows).toEqual([
      { tone: "success", what: "MyModule.ACT_Order_Save", note: "2 variables, 3 references", target: { documentId: "u1" } },
    ]);
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

describe("plural", () => {
  it("adds an s except for one, and is null for zero", () => {
    expect(plural(1, "rename")).toBe("1 rename");
    expect(plural(4, "rename")).toBe("4 renames");
    expect(plural(0, "rename")).toBeNull();
  });
});

describe("timingsGroup", () => {
  it("is empty without timed steps", () => {
    expect(timingsGroup(new JobTimings())).toEqual({ title: "Timings", rows: [] });
  });

  it("uses the step time when the dialog was not timed", async () => {
    const timings = new JobTimings(() => 0);
    await timings.measureStep("Preparing", async () => true);
    expect(timingsGroup(timings).rows[0]).toEqual({ tone: "info", what: "Total 0.0 s", note: "1 steps 0.0 s, between steps 0.0 s" });
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
