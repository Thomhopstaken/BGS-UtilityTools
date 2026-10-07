import type { Primitives, ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { changed, fakeContext, fakeProgressRunner, fakeUnit, fakeUnitAccess, fakeUnitInfo, fakeUpdater } from "../helpers/fakes";
import {
  buildSteps,
  type EntityStep,
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

function entityStep(run: EntityStep["run"] = async (report) => {
  report.entityRenamed = true;
  return true;
}): EntityStep {
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

  it("loads only the units the updater accepts at run time", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const update = vi.fn(async () => ({ ...UNCHANGED }));
    const report = new RenameReport();
    const updater: UnitUpdater = { ...fakeUpdater(access, update), accepts: (info, r) => r === report && info.$ID === "b" };
    expect(await runBatch(batchOf(updater, [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), report)).toBe(true);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 1 }]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(report.checkedUnits).toBe(1);
  });

  it("skips loading when the updater accepts no unit", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    const updater: UnitUpdater = { ...fakeUpdater(access), accepts: () => false };
    expect(await runBatch(batchOf(updater, [fakeUnitInfo("a", MF)]), new RenameReport())).toBe(true);
    expect(access.loadCalls).toEqual([]);
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
  it("creates the planner steps, the entity step, then the updater steps", async () => {
    const planAccess = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const planner = fakeUpdater(planAccess, undefined, { label: "Microflows (plan)", title: "Planning microflows", description: "Finding flows" });
    const updater = fakeUpdater(fakeUnitAccess([fakeUnit("a")]), undefined, { description: "Renaming flows" });
    const planBatchList: PlannedBatch[] = [
      { updater: planner, infos: [fakeUnitInfo("a", MF)], first: 1, last: 1, total: 2 },
      { updater: planner, infos: [fakeUnitInfo("b", MF)], first: 2, last: 2, total: 2 },
    ];
    const report = new RenameReport();
    const entity = entityStep();
    const steps = buildSteps(planBatchList, entity, [batchOf(updater, [fakeUnitInfo("a", MF)])], report, context);
    expect(steps.map((s) => [s.title, s.description])).toEqual([
      ["Planning microflows", "Finding flows (Order -> Purchase), 2 documents"],
      ["Rename entity", "MyModule.Order -> Purchase"],
      ["Updating microflows", "Renaming flows (Order -> Purchase), 1 documents"],
    ]);
    expect(await steps[0].action()).toBe(true);
    expect(planAccess.loadCalls).toHaveLength(2);
    expect(report.checkedUnits).toBe(2);
    expect(await steps[1].action()).toBe(true);
    expect(entity.run).toHaveBeenCalledWith(report);
  });

  it("creates a separate step per updater", () => {
    const flows = fakeUpdater(fakeUnitAccess([]));
    const pages = fakeUpdater(fakeUnitAccess([]), undefined, { label: "Pages", unitType: "Pages$Page" });
    const steps = buildSteps(
      [],
      entityStep(),
      [batchOf(flows, [fakeUnitInfo("a", MF)]), batchOf(pages, [fakeUnitInfo("p", "Pages$Page")])],
      new RenameReport(),
      context,
    );
    expect(steps.map((s) => s.title)).toEqual(["Rename entity", "Updating microflows", "Updating pages"]);
  });
});

describe("runRenameJob", () => {
  it("runs planners, the entity step, then the updaters, and returns the report", async () => {
    const calls: string[] = [];
    const planAccess = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const updateAccess = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const planner = fakeUpdater(
      planAccess,
      async () => {
        calls.push("plan");
        return { ...UNCHANGED };
      },
      { label: "Microflows (plan)", title: "Planning microflows" },
    );
    const updater = fakeUpdater(updateAccess, async () => {
      calls.push("update");
      return changed();
    });
    const entity = entityStep(async (report) => {
      calls.push("entity");
      report.entityRenamed = true;
      return true;
    });
    const runner = fakeProgressRunner();
    const { dialog, report } = await runRenameJob(
      { planners: [planner], entityStep: entity, updaters: [updater], runProgress: runner.run },
      context,
    );
    expect(dialog.result).toBe("Success");
    expect(calls).toEqual(["plan", "entity", "update"]);
    expect(runner.titles).toEqual(["Renaming MyModule.Order to Purchase"]);
    expect(runner.steps.map((s) => s.title)).toEqual(["Planning microflows", "Rename entity", "Updating microflows"]);
    expect(planAccess.saved).toEqual([]);
    expect(updateAccess.saved.map((u) => u.$ID)).toEqual(["a"]);
    expect(report.entityRenamed).toBe(true);
    expect(report.entitySkipReason).toBeNull();
    expect(report.incompleteReason).toBeNull();
  });

  it("passes the batch size to the planner", async () => {
    const infos = [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF), fakeUnitInfo("c", MF)];
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b"), fakeUnit("c")], infos);
    const runner = fakeProgressRunner();
    await runRenameJob(
      { planners: [], entityStep: entityStep(), updaters: [fakeUpdater(access)], runProgress: runner.run, batchSize: 2 },
      context,
    );
    expect(runner.steps).toHaveLength(2);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
  });

  it("stops before any update when the entity step fails", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const updater = fakeUpdater(access, async () => changed());
    const entity = entityStep(async (report) => {
      report.skipEntity("2 documents could not be checked; nothing was changed");
      return "2 documents could not be checked; nothing was changed";
    });
    const runner = fakeProgressRunner();
    const { dialog, report } = await runRenameJob(
      { planners: [], entityStep: entity, updaters: [updater], runProgress: runner.run },
      context,
    );
    expect(dialog.result).toBe("Failure");
    expect(access.loadCalls).toEqual([]);
    expect(access.saved).toEqual([]);
    expect(report.entitySkipReason).toBe("2 documents could not be checked; nothing was changed");
    expect(report.incompleteReason).toBeNull();
  });

  it.each([
    ["UserCancelled", "cancelled by user; nothing was changed"],
    ["Failure", "the process failed; nothing was changed"],
  ] as const)("reports nothing changed on %s before the entity rename", async (result, reason) => {
    const runner = fakeProgressRunner({ result } as ProgressDialogResult);
    const { report } = await runRenameJob({ planners: [], entityStep: entityStep(), updaters: [], runProgress: runner.run }, context);
    expect(report.entitySkipReason).toBe(reason);
    expect(report.incompleteReason).toBeNull();
  });

  it("reports an incomplete rename when cancelled after the entity rename", async () => {
    // Runs the entity step, then cancels before the updaters.
    const runProgress = async (_title: string, steps: { action: () => Promise<true | string> }[]) => {
      await steps[0].action();
      return { result: "UserCancelled" } as ProgressDialogResult;
    };
    const { report } = await runRenameJob({ planners: [], entityStep: entityStep(), updaters: [], runProgress }, context);
    expect(report.entityRenamed).toBe(true);
    expect(report.entitySkipReason).toBeNull();
    expect(report.incompleteReason).toBe(
      "cancelled by user; the entity was renamed but the remaining documents were not updated, check the error list",
    );
  });

  it("keeps an earlier skip reason on failure", async () => {
    const runner = fakeProgressRunner();
    const entity = entityStep(async (report) => {
      report.skipEntity("name taken");
      return "name taken";
    });
    const { dialog, report } = await runRenameJob({ planners: [], entityStep: entity, updaters: [], runProgress: runner.run }, context);
    expect(dialog.result).toBe("Failure");
    expect(report.entitySkipReason).toBe("name taken");
  });
});
