import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { buildSteps, runRenameJob } from "../../../NameChanger/framework/EntityRenameJob";
import { RenameReport } from "../../../NameChanger/framework/RenameReport";
import type { JobStep } from "../../../shared/rename/RenameJob";
import { UNCHANGED } from "../../../shared/rename/types";
import { changed, fakeProgressRunner, fakeUnit, fakeUnitAccess, fakeUnitInfo, fakeUpdater } from "../../shared/helpers/fakes";
import { fakeContext } from "../helpers/fakes";

const context = fakeContext();
const MF = "Microflows$Microflow";

function entityStep(run: JobStep<RenameReport>["run"] = async (report) => {
  report.entityRenamed = true;
  return true;
}): JobStep<RenameReport> {
  return { title: "Rename entity", run: vi.fn(run) };
}

function prepareStep(run: JobStep<RenameReport>["run"] = async () => true): JobStep<RenameReport> {
  return { title: "Preparing", run: vi.fn(run) };
}

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
