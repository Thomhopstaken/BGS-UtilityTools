import type { Primitives, ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { changed, fakeContext, fakeProgressRunner, fakeUnit, fakeUnitAccess, fakeUnitInfo, fakeUpdater } from "../helpers/fakes";
import {
  buildSteps,
  type EntityStep,
  runBatch,
  runBatches,
  runRenameJob,
  runUpdater,
  unitDisplayName,
  updateUnit,
} from "../../../EntityNameChanger/framework/RenameJob";
import { UnitInfoCache } from "../../../EntityNameChanger/framework/UnitInfoCache";
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

  it("loads nothing for an empty batch", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    expect(await runBatch(batchOf(fakeUpdater(access), []), new RenameReport())).toBe(true);
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

  it("shows every updated unit to the observer, after updating it", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const order: string[] = [];
    const updater = fakeUpdater(access, async (unit) => {
      order.push(`update ${unit.$ID}`);
      return { ...UNCHANGED };
    });
    const observer = vi.fn((unit: Primitives.UnitBase, info: Readonly<Primitives.UnitInfo>) => {
      order.push(`observe ${unit.$ID} ${info.$ID}`);
    });
    await runBatch(batchOf(updater, [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), new RenameReport(), observer);
    expect(order).toEqual(["update a", "observe a a", "update b", "observe b b"]);
  });

  it("logs a failing observer and continues", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const update = vi.fn(async () => ({ ...UNCHANGED }));
    const report = new RenameReport();
    const observer = () => {
      throw new Error("index broken");
    };
    expect(await runBatch(batchOf(fakeUpdater(access, update), [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), report, observer)).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
    expect(report.failures).toEqual([]);
  });

  it("plans from metadata without loading, reporting each unit", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    const update = vi.fn(async () => ({ ...UNCHANGED }));
    const fromInfo = vi.fn((info: Readonly<Primitives.UnitInfo>) => {
      if (info.$ID === "b") {
        throw new Error("no name");
      }
      return { ...UNCHANGED };
    });
    const observer = vi.fn();
    const updater: UnitUpdater = { ...fakeUpdater(access, update), updateFromInfo: fromInfo };
    const report = new RenameReport();
    expect(await runBatch(batchOf(updater, [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), report, observer)).toBe(true);
    expect(access.loadCalls).toEqual([]);
    expect(update).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
    expect(fromInfo).toHaveBeenCalledTimes(2);
    expect(report.checkedUnits).toBe(2);
    expect(report.failures.map((f) => f.error)).toEqual(["no name"]);
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

function prepareStep(run: EntityStep["run"] = async () => true): EntityStep {
  return { title: "Preparing", run: vi.fn(run) };
}

describe("runUpdater", () => {
  it("lists the units when it runs, then runs the batches", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b"), fakeUnit("c")], [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF), fakeUnitInfo("c", MF)]);
    const report = new RenameReport();
    expect(await runUpdater(fakeUpdater(access), report, context, 2, new UnitInfoCache())).toBe(true);
    expect(access.getUnitsInfoCalls).toBe(1);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
    expect(report.checkedUnits).toBe(3);
  });

  it("loads only the units the updater accepts when the step runs, in full batches", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    const access = fakeUnitAccess(ids.map((id) => fakeUnit(id)), ids.map((id) => fakeUnitInfo(id, MF)));
    const update = vi.fn(async () => ({ ...UNCHANGED }));
    const report = new RenameReport();
    const updater: UnitUpdater = { ...fakeUpdater(access, update), accepts: (info, r) => r === report && info.$ID !== "b" && info.$ID !== "c" };
    expect(await runUpdater(updater, report, context, 2, new UnitInfoCache())).toBe(true);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
    expect(update).toHaveBeenCalledTimes(3);
    expect(report.checkedUnits).toBe(3);
  });

  it("loads nothing when the updater accepts no unit", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const updater: UnitUpdater = { ...fakeUpdater(access), accepts: () => false };
    expect(await runUpdater(updater, new RenameReport(), context, 2, new UnitInfoCache())).toBe(true);
    expect(access.loadCalls).toEqual([]);
  });

  it("returns a message when the units cannot be listed", async () => {
    const access = fakeUnitAccess([]);
    access.getUnitsInfo = async () => {
      throw new Error("offline");
    };
    expect(await runUpdater(fakeUpdater(access), new RenameReport(), context, 2, new UnitInfoCache())).toBe("Could not list microflows: Error: offline");
  });
});

describe("buildSteps", () => {
  it("creates prepare, planner, entity and updater steps without listing units", async () => {
    const planAccess = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")], [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]);
    const updateAccess = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const planner = fakeUpdater(planAccess, undefined, { label: "Microflows (plan)", title: "Planning microflows", description: "Finding flows" });
    const updater = fakeUpdater(updateAccess, undefined, { description: "Renaming flows" });
    const report = new RenameReport();
    const prepare = prepareStep();
    const entity = entityStep();
    const steps = buildSteps({ prepare, planners: [planner], entityStep: entity, updaters: [updater] }, report, context, { plan: 1, write: 1 });
    expect(steps.map((s) => [s.title, s.description])).toEqual([
      ["Preparing", "Checking MyModule.Order and loading document names"],
      ["Planning microflows", "Finding flows (Order -> Purchase)"],
      ["Rename entity", "MyModule.Order -> Purchase"],
      ["Updating microflows", "Renaming flows (Order -> Purchase)"],
    ]);
    expect(planAccess.getUnitsInfoCalls + updateAccess.getUnitsInfoCalls).toBe(0);
    expect(await steps[0].action()).toBe(true);
    expect(prepare.run).toHaveBeenCalledWith(report);
    expect(await steps[1].action()).toBe(true);
    expect(planAccess.loadCalls).toHaveLength(2);
    expect(report.checkedUnits).toBe(2);
    expect(await steps[2].action()).toBe(true);
    expect(entity.run).toHaveBeenCalledWith(report);
  });

  it("leaves out stubs and keeps an empty updater as a step", () => {
    const stub = fakeUpdater(fakeUnitAccess([]), undefined, { label: "Rules", implemented: false });
    const empty = fakeUpdater(fakeUnitAccess([]), undefined, { label: "Pages", unitType: "Pages$Page" });
    const steps = buildSteps({ prepare: prepareStep(), planners: [stub], entityStep: entityStep(), updaters: [empty] }, new RenameReport(), context);
    expect(steps.map((s) => s.title)).toEqual(["Preparing", "Rename entity", "Updating pages"]);
  });

  it("lists units once per model api", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const first = fakeUpdater(access, undefined, { label: "Microflows (plan)" });
    const second = fakeUpdater(access);
    const steps = buildSteps({ prepare: prepareStep(), planners: [first], entityStep: entityStep(), updaters: [second] }, new RenameReport(), context);
    for (const step of steps) {
      await step.action();
    }
    expect(access.getUnitsInfoCalls).toBe(1);
    expect(access.loadCalls).toHaveLength(2);
  });

  it("times every step under its title, a failing step included", async () => {
    const report = new RenameReport();
    const failing = entityStep(async () => "boom");
    const steps = buildSteps({ prepare: prepareStep(), planners: [], entityStep: failing, updaters: [fakeUpdater(fakeUnitAccess([]))] }, report, context);
    for (const step of steps) {
      await step.action();
    }
    expect(report.timings.steps.map((s) => s.title)).toEqual(["Preparing", "Rename entity", "Updating microflows"]);
  });
});

describe("runRenameJob", () => {
  it("opens the dialog before listing units, then runs prepare, planners, entity step and updaters", async () => {
    const calls: string[] = [];
    const planAccess = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const updateAccess = fakeUnitAccess([fakeUnit("b")], [fakeUnitInfo("b", MF)]);
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
    const prepare = prepareStep(async () => {
      calls.push("prepare");
      return true;
    });
    const entity = entityStep(async (report) => {
      calls.push("entity");
      report.entityRenamed = true;
      return true;
    });
    const runner = fakeProgressRunner();
    const run = runner.run;
    runner.run = async (title, steps) => {
      calls.push(`dialog (${planAccess.getUnitsInfoCalls + updateAccess.getUnitsInfoCalls} listings)`);
      return run(title, steps);
    };
    const { dialog, report } = await runRenameJob(
      { prepare, planners: [planner], entityStep: entity, updaters: [updater], runProgress: runner.run },
      context,
    );
    expect(dialog.result).toBe("Success");
    expect(calls).toEqual(["dialog (0 listings)", "prepare", "plan", "entity", "update"]);
    expect(runner.titles).toEqual(["Renaming MyModule.Order to Purchase"]);
    expect(runner.steps.map((s) => s.title)).toEqual(["Preparing", "Planning microflows", "Rename entity", "Updating microflows"]);
    expect(planAccess.saved).toEqual([]);
    expect(updateAccess.saved.map((u) => u.$ID)).toEqual(["b"]);
    expect(report.entityRenamed).toBe(true);
    expect(report.entitySkipReason).toBeNull();
    expect(report.incompleteReason).toBeNull();
    expect(report.timings.steps).toHaveLength(4);
    expect(report.timings.dialogMs).not.toBeNull();
  });

  it("passes the batch size to each step", async () => {
    const infos = [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF), fakeUnitInfo("c", MF)];
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b"), fakeUnit("c")], infos);
    const runner = fakeProgressRunner();
    await runRenameJob(
      { prepare: prepareStep(), planners: [], entityStep: entityStep(), updaters: [fakeUpdater(access)], runProgress: runner.run, batchSize: 2 },
      context,
    );
    expect(runner.steps).toHaveLength(3);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
  });

  it("uses the plan batch size for planners and observes only their units", async () => {
    const infos = [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF), fakeUnitInfo("c", MF)];
    const planAccess = fakeUnitAccess([fakeUnit("a"), fakeUnit("b"), fakeUnit("c")], infos);
    const writeAccess = fakeUnitAccess([fakeUnit("a"), fakeUnit("b"), fakeUnit("c")], infos);
    const observed: string[] = [];
    await runRenameJob(
      {
        prepare: prepareStep(),
        planners: [fakeUpdater(planAccess, undefined, { label: "Microflows (plan)" })],
        planObserver: (unit) => observed.push(unit.$ID),
        entityStep: entityStep(),
        updaters: [fakeUpdater(writeAccess)],
        runProgress: fakeProgressRunner().run,
        batchSize: 1,
        planBatchSize: 3,
      },
      context,
    );
    expect(planAccess.loadCalls).toEqual([{ maxUnitsToLoad: 3 }]);
    expect(writeAccess.loadCalls).toEqual([{ maxUnitsToLoad: 1 }, { maxUnitsToLoad: 1 }, { maxUnitsToLoad: 1 }]);
    expect(observed).toEqual(["a", "b", "c"]);
  });

  it("stops before listing or loading anything when preparing fails", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const prepare = prepareStep(async (report) => {
      report.skipEntity("An entity named MyModule.Purchase already exists.");
      return "An entity named MyModule.Purchase already exists.";
    });
    const entity = entityStep();
    const runner = fakeProgressRunner();
    const { dialog, report } = await runRenameJob(
      { prepare, planners: [fakeUpdater(access)], entityStep: entity, updaters: [fakeUpdater(access, async () => changed())], runProgress: runner.run },
      context,
    );
    expect(dialog.result).toBe("Failure");
    expect(access.getUnitsInfoCalls).toBe(0);
    expect(access.saved).toEqual([]);
    expect(entity.run).not.toHaveBeenCalled();
    expect(report.entitySkipReason).toBe("An entity named MyModule.Purchase already exists.");
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
      { prepare: prepareStep(), planners: [], entityStep: entity, updaters: [updater], runProgress: runner.run },
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
    const { report } = await runRenameJob(
      { prepare: prepareStep(), planners: [], entityStep: entityStep(), updaters: [], runProgress: runner.run },
      context,
    );
    expect(report.entitySkipReason).toBe(reason);
    expect(report.incompleteReason).toBeNull();
  });

  it("reports an incomplete rename when cancelled after the entity rename", async () => {
    // Runs prepare and the entity step, then cancels before the updaters.
    const runProgress = async (_title: string, steps: { action: () => Promise<true | string> }[]) => {
      await steps[0].action();
      await steps[1].action();
      return { result: "UserCancelled" } as ProgressDialogResult;
    };
    const { report } = await runRenameJob(
      { prepare: prepareStep(), planners: [], entityStep: entityStep(), updaters: [], runProgress },
      context,
    );
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
    const { dialog, report } = await runRenameJob(
      { prepare: prepareStep(), planners: [], entityStep: entity, updaters: [], runProgress: runner.run },
      context,
    );
    expect(dialog.result).toBe("Failure");
    expect(report.entitySkipReason).toBe("name taken");
  });
});

