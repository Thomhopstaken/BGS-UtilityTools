import { describe, expect, it } from "vitest";
import { countLabel, countRows, isOpenByDefault, onlyProblems, type RunLog, runLogMeta } from "../../../shared/design/runLog";

describe("counts and filters", () => {
  const log: RunLog = {
    outcome: { tone: "warning", text: "x" },
    groups: [
      { title: "A", rows: [{ tone: "success", what: "a1" }, { tone: "warning", what: "a2" }] },
      { title: "B", rows: [{ tone: "success", what: "b1" }] },
      { title: "C", rows: [{ tone: "error", what: "c1" }, { tone: "error", what: "c2" }] },
      { title: "D", rows: [{ tone: "info", what: "d1" }] },
    ],
  };

  it("counts rows per tone, info rows left out", () => {
    expect(countRows(log)).toEqual({ success: 2, warning: 1, error: 2 });
  });

  it("keeps problem rows and drops empty groups", () => {
    expect(onlyProblems(log.groups)).toEqual([
      { title: "A", rows: [{ tone: "warning", what: "a2" }] },
      { title: "C", rows: [{ tone: "error", what: "c1" }, { tone: "error", what: "c2" }] },
    ]);
  });

  it("opens groups with problems only", () => {
    expect(log.groups.map(isOpenByDefault)).toEqual([true, false, true, false]);
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
