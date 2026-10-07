import type { Primitives, ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { changed, fakeContext, fakeProgressRunner, fakeUnit, fakeUnitAccess, fakeUnitInfo, fakeUpdater } from "../helpers/fakes";
import {
  buildSteps,
  type FinalStep,
  groupByUpdater,
  runBatch,
  runBatches,
  runRenameJob,
  unitDisplayName,
  updateUnit,
} from "../../../EntityNameChanger/framework/RenameJob";
import type { PlannedBatch } from "../../../EntityNameChanger/framework/RenamePlanner";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";
import { UNCHANGED, type UnitUpdater } from "../../../EntityNameChanger/framework/types";

const context = fakeContext();
const MF = "Microflows$Microflow";

function batchOf(updater: UnitUpdater, infos: Readonly<Primitives.UnitInfo>[]): PlannedBatch {
  return { updater, infos, first: 1, last: infos.length, total: infos.length };
}

function finalStep(run: FinalStep["run"] = async () => true): FinalStep {
  return { title: "Rename entity", run: vi.fn(run) };
}

describe("unitDisplayName", () => {
  it("qualifies with the module name", () => {
    expect(unitDisplayName(fakeUnitInfo("a", MF, "Sales", "ACT_Order"))).toBe("Sales.ACT_Order");
  });

  it("falls back to the id and leaves out a missing module", () => {
    expect(unitDisplayName({ $ID: "a", $Type: MF } as never)).toBe("a");
    expect(unitDisplayName({ $ID: "x", $Type: MF, name: "Flow" } as never)).toBe("Flow");
  });
});

describe("runBatch", () => {
  it("saves only changed units and reports every unit", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const updater = fakeUpdater(access, async (unit) => (unit.$ID === "a" ? changed() : { ...UNCHANGED }));
    const report = new RenameReport();
    const outcome = await runBatch(batchOf(updater, [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), report);
    expect(outcome).toBe(true);
    expect(access.saved.map((u) => u.$ID)).toEqual(["a"]);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }]);
    expect(report.checkedUnits).toBe(2);
    expect(report.changed.map((c) => c.unitId)).toEqual(["a"]);
  });

  it("returns a message when the batch cannot load", async () => {
    const access = fakeUnitAccess([]);
    access.loadError = new Error("offline");
    const report = new RenameReport();
    const outcome = await runBatch(batchOf(fakeUpdater(access), [fakeUnitInfo("a", MF)]), report);
    expect(outcome).toBe("Could not load microflows 1-1: Error: offline");
    expect(report.checkedUnits).toBe(0);
  });

  it("ignores loaded units that were not requested", async () => {
    // A loadAll that ignores the filter.
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("x")]);
    access.loadAll = async () => [fakeUnit("a"), fakeUnit("x")];
    const update = vi.fn(async () => changed());
    const report = new RenameReport();
    await runBatch(batchOf(fakeUpdater(access, update), [fakeUnitInfo("a", MF)]), report);
    expect(update).toHaveBeenCalledTimes(1);
    expect(access.saved.map((u) => u.$ID)).toEqual(["a"]);
  });

  it("reports a failing unit and continues with the next one", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const updater = fakeUpdater(access, async (unit) => {
      if (unit.$ID === "a") {
        throw new Error("broken flow");
      }
      return changed();
    });
    const report = new RenameReport();
    expect(await runBatch(batchOf(updater, [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), report)).toBe(true);
    expect(report.failures.map((f) => f.error)).toEqual(["broken flow"]);
    expect(access.saved.map((u) => u.$ID)).toEqual(["b"]);
  });
});

describe("runBatches", () => {
  it("runs every batch in order", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const updater = fakeUpdater(access);
    const report = new RenameReport();
    const outcome = await runBatches([batchOf(updater, [fakeUnitInfo("a", MF)]), batchOf(updater, [fakeUnitInfo("b", MF)])], report);
    expect(outcome).toBe(true);
    expect(access.loadCalls).toHaveLength(2);
    expect(report.checkedUnits).toBe(2);
  });

  it("stops at the first batch that cannot load", async () => {
    const access = fakeUnitAccess([]);
    access.loadError = new Error("offline");
    const report = new RenameReport();
    const updater = fakeUpdater(access);
    const outcome = await runBatches([batchOf(updater, [fakeUnitInfo("a", MF)]), batchOf(updater, [fakeUnitInfo("b", MF)])], report);
    expect(outcome).toBe("Could not load microflows 1-1: Error: offline");
    expect(access.loadCalls).toHaveLength(1);
  });

  it("returns true for no batches", async () => {
    expect(await runBatches([], new RenameReport())).toBe(true);
  });
});

describe("groupByUpdater", () => {
  it("groups batches per updater in planner order", () => {
    const flows = fakeUpdater(fakeUnitAccess([]));
    const pages = fakeUpdater(fakeUnitAccess([]), undefined, { label: "Pages", unitType: "Pages$Page" });
    const b1 = batchOf(flows, [fakeUnitInfo("a", MF)]);
    const b2 = batchOf(flows, [fakeUnitInfo("b", MF)]);
    const b3 = batchOf(pages, [fakeUnitInfo("p", "Pages$Page")]);
    const groups = groupByUpdater([b1, b2, b3]);
    expect([...groups.keys()]).toEqual([flows, pages]);
    expect(groups.get(flows)).toEqual([b1, b2]);
    expect(groups.get(pages)).toEqual([b3]);
  });
});

describe("updateUnit", () => {
  it("reports a failing save as a unit error", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    access.save = async () => {
      throw new Error("read-only");
    };
    const report = new RenameReport();
    await updateUnit(fakeUpdater(access, async () => changed()), fakeUnit("a"), fakeUnitInfo("a", MF), report);
    expect(report.failures.map((f) => f.error)).toEqual(["read-only"]);
  });

  it("does not save an unchanged unit", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    const report = new RenameReport();
    await updateUnit(fakeUpdater(access), fakeUnit("a"), fakeUnitInfo("a", MF), report);
    expect(access.saved).toEqual([]);
    expect(report.checkedUnits).toBe(1);
  });
});

describe("buildSteps", () => {
  it("creates one step per updater that runs all its batches, plus the final step", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const updater = fakeUpdater(access, undefined, { description: "Renaming flows" });
    const batches: PlannedBatch[] = [
      { updater, infos: [fakeUnitInfo("a", MF)], first: 1, last: 1, total: 2 },
      { updater, infos: [fakeUnitInfo("b", MF)], first: 2, last: 2, total: 2 },
    ];
    const report = new RenameReport();
    const final = finalStep();
    const steps = buildSteps(batches, report, final, context);
    expect(steps.map((s) => [s.title, s.description])).toEqual([
      ["Updating microflows", "Renaming flows (Order -> Purchase), 2 documents"],
      ["Rename entity", "MyModule.Order -> Purchase"],
    ]);
    expect(await steps[0].action()).toBe(true);
    expect(access.loadCalls).toHaveLength(2);
    expect(report.checkedUnits).toBe(2);
    expect(await steps[1].action()).toBe(true);
    expect(final.run).toHaveBeenCalledWith(report);
  });

  it("creates a separate step per updater", () => {
    const flows = fakeUpdater(fakeUnitAccess([]));
    const pages = fakeUpdater(fakeUnitAccess([]), undefined, { label: "Pages", unitType: "Pages$Page" });
    const steps = buildSteps(
      [batchOf(flows, [fakeUnitInfo("a", MF)]), batchOf(pages, [fakeUnitInfo("p", "Pages$Page")])],
      new RenameReport(),
      finalStep(),
      context,
    );
    expect(steps.map((s) => s.title)).toEqual(["Updating microflows", "Updating pages", "Rename entity"]);
  });
});

describe("runRenameJob", () => {
  it("runs updater steps then the final step and returns the report", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const runner = fakeProgressRunner();
    const final = finalStep(async (report) => {
      report.entityRenamed = true;
      return true;
    });
    const { dialog, report } = await runRenameJob(
      { updaters: [fakeUpdater(access, async () => changed())], runProgress: runner.run, finalStep: final },
      context,
    );
    expect(dialog.result).toBe("Success");
    expect(runner.titles).toEqual(["Renaming MyModule.Order to Purchase"]);
    expect(runner.steps.map((s) => s.title)).toEqual(["Updating microflows", "Rename entity"]);
    expect(report.changed).toHaveLength(1);
    expect(report.entityRenamed).toBe(true);
    expect(report.entitySkipReason).toBeNull();
  });

  it("passes the batch size to the planner", async () => {
    const infos = [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF), fakeUnitInfo("c", MF)];
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b"), fakeUnit("c")], infos);
    const runner = fakeProgressRunner();
    await runRenameJob(
      { updaters: [fakeUpdater(access)], runProgress: runner.run, finalStep: finalStep(), batchSize: 2 },
      context,
    );
    expect(runner.steps).toHaveLength(2);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
  });

  it.each([
    ["UserCancelled", "cancelled by user"],
    ["Failure", "the process failed"],
  ] as const)("marks the entity skipped on %s", async (result, reason) => {
    const runner = fakeProgressRunner({ result } as ProgressDialogResult);
    const { report } = await runRenameJob({ updaters: [], runProgress: runner.run, finalStep: finalStep() }, context);
    expect(report.entitySkipReason).toBe(reason);
  });

  it("keeps an earlier skip reason on failure", async () => {
    const runner = fakeProgressRunner();
    const final = finalStep(async (report) => {
      report.skipEntity("name taken");
      return "name taken";
    });
    const { dialog, report } = await runRenameJob({ updaters: [], runProgress: runner.run, finalStep: final }, context);
    expect(dialog.result).toBe("Failure");
    expect(report.entitySkipReason).toBe("name taken");
  });

  it("does not mark the entity skipped when it was already renamed", async () => {
    const runner = fakeProgressRunner();
    const final = finalStep(async (report) => {
      report.entityRenamed = true;
      return "late failure";
    });
    const { report } = await runRenameJob({ updaters: [], runProgress: runner.run, finalStep: final }, context);
    expect(report.entitySkipReason).toBeNull();
  });
});
