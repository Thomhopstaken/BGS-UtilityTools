import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { JobReport } from "../../../shared/rename/JobReport";
import { buildJobSteps, runBatch, runBatches, runJob, runUpdater, unitDisplayName, updateUnit } from "../../../shared/rename/RenameJob";
import type { PlannedBatch } from "../../../shared/rename/RenamePlanner";
import { UNCHANGED, type UnitUpdater } from "../../../shared/rename/types";
import { UnitInfoCache } from "../../../shared/rename/UnitInfoCache";
import { changed, fakeProgressRunner, fakeScope, fakeUnit, fakeUnitAccess, fakeUnitInfo, fakeUpdater } from "../helpers/fakes";

const scope = fakeScope();
const MF = "Microflows$Microflow";

function batchOf(updater: UnitUpdater, infos: Readonly<Primitives.UnitInfo>[]): PlannedBatch {
  return { updater, infos, first: 1, last: infos.length, total: infos.length };
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
    const report = new JobReport();
    const outcome = await runBatch(batchOf(updater, [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), report);
    expect(outcome).toBe(true);
    expect(access.saved.map((u) => u.$ID)).toEqual(["a"]);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }]);
    expect(report.checkedUnits).toBe(2);
    expect(report.changed.map((c) => c.unitId)).toEqual(["a"]);
  });

  it("loads nothing for an empty batch", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    expect(await runBatch(batchOf(fakeUpdater(access), []), new JobReport())).toBe(true);
    expect(access.loadCalls).toEqual([]);
  });

  it("returns a message when the batch cannot load", async () => {
    const access = fakeUnitAccess([]);
    access.loadError = new Error("offline");
    const report = new JobReport();
    const outcome = await runBatch(batchOf(fakeUpdater(access), [fakeUnitInfo("a", MF)]), report);
    expect(outcome).toBe("Could not load microflows 1-1: Error: offline");
    expect(report.checkedUnits).toBe(0);
  });

  it("ignores loaded units that were not requested", async () => {
    // A loadAll that ignores the filter.
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("x")]);
    access.loadAll = async () => [fakeUnit("a"), fakeUnit("x")];
    const update = vi.fn(async () => changed());
    const report = new JobReport();
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
    const report = new JobReport();
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
    await runBatch(batchOf(updater, [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), new JobReport(), observer);
    expect(order).toEqual(["update a", "observe a a", "update b", "observe b b"]);
  });

  it("logs a failing observer and continues", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b")]);
    const update = vi.fn(async () => ({ ...UNCHANGED }));
    const report = new JobReport();
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
    const report = new JobReport();
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
    const report = new JobReport();
    const outcome = await runBatches([batchOf(updater, [fakeUnitInfo("a", MF)]), batchOf(updater, [fakeUnitInfo("b", MF)])], report);
    expect(outcome).toBe(true);
    expect(access.loadCalls).toHaveLength(2);
    expect(report.checkedUnits).toBe(2);
  });

  it("stops at the first batch that cannot load", async () => {
    const access = fakeUnitAccess([]);
    access.loadError = new Error("offline");
    const report = new JobReport();
    const updater = fakeUpdater(access);
    const outcome = await runBatches([batchOf(updater, [fakeUnitInfo("a", MF)]), batchOf(updater, [fakeUnitInfo("b", MF)])], report);
    expect(outcome).toBe("Could not load microflows 1-1: Error: offline");
    expect(access.loadCalls).toHaveLength(1);
  });

  it("returns true for no batches", async () => {
    expect(await runBatches([], new JobReport())).toBe(true);
  });
});

describe("updateUnit", () => {
  it("reports a failing save as a unit error", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    access.save = async () => {
      throw new Error("read-only");
    };
    const report = new JobReport();
    await updateUnit(fakeUpdater(access, async () => changed()), fakeUnit("a"), fakeUnitInfo("a", MF), report);
    expect(report.failures.map((f) => f.error)).toEqual(["read-only"]);
  });

  it("does not save an unchanged unit", async () => {
    const access = fakeUnitAccess([fakeUnit("a")]);
    const report = new JobReport();
    await updateUnit(fakeUpdater(access), fakeUnit("a"), fakeUnitInfo("a", MF), report);
    expect(access.saved).toEqual([]);
    expect(report.checkedUnits).toBe(1);
  });
});

describe("runUpdater", () => {
  it("lists the units when it runs, then runs the batches", async () => {
    const access = fakeUnitAccess([fakeUnit("a"), fakeUnit("b"), fakeUnit("c")], [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF), fakeUnitInfo("c", MF)]);
    const report = new JobReport();
    expect(await runUpdater(fakeUpdater(access), report, scope, 2, new UnitInfoCache())).toBe(true);
    expect(access.getUnitsInfoCalls).toBe(1);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
    expect(report.checkedUnits).toBe(3);
  });

  it("loads only the units the updater accepts when the step runs, in full batches", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    const access = fakeUnitAccess(ids.map((id) => fakeUnit(id)), ids.map((id) => fakeUnitInfo(id, MF)));
    const update = vi.fn(async () => ({ ...UNCHANGED }));
    const report = new JobReport();
    const updater: UnitUpdater = { ...fakeUpdater(access, update), accepts: (info, r) => r === report && info.$ID !== "b" && info.$ID !== "c" };
    expect(await runUpdater(updater, report, scope, 2, new UnitInfoCache())).toBe(true);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
    expect(update).toHaveBeenCalledTimes(3);
    expect(report.checkedUnits).toBe(3);
  });

  it("loads nothing when the updater accepts no unit", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const updater: UnitUpdater = { ...fakeUpdater(access), accepts: () => false };
    expect(await runUpdater(updater, new JobReport(), scope, 2, new UnitInfoCache())).toBe(true);
    expect(access.loadCalls).toEqual([]);
  });

  it("returns a message when the units cannot be listed", async () => {
    const access = fakeUnitAccess([]);
    access.getUnitsInfo = async () => {
      throw new Error("offline");
    };
    expect(await runUpdater(fakeUpdater(access), new JobReport(), scope, 2, new UnitInfoCache())).toBe("Could not list microflows: Error: offline");
  });
});

describe("runUpdater with an idle updater", () => {
  it("lists nothing and succeeds", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const report = new JobReport();
    const isIdle = vi.fn((r: JobReport) => r === report);
    expect(await runUpdater(fakeUpdater(access, undefined, { isIdle }), report, scope, 2, new UnitInfoCache())).toBe(true);
    expect(isIdle).toHaveBeenCalledOnce();
    expect(access.getUnitsInfoCalls).toBe(0);
    expect(access.loadCalls).toEqual([]);
  });

  it("runs normally when not idle", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    expect(await runUpdater(fakeUpdater(access, undefined, { isIdle: () => false }), new JobReport(), scope, 2, new UnitInfoCache())).toBe(true);
    expect(access.loadCalls).toHaveLength(1);
  });
});

describe("load failures reported instead of stopping", () => {
  it("fails every unit of the batch and goes on with the next batch", async () => {
    const failing = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    failing.loadError = new Error("gone");
    const working = fakeUnitAccess([fakeUnit("c")]);
    const update = vi.fn(async () => changed());
    const report = new JobReport();
    const outcome = await runBatches(
      [batchOf(fakeUpdater(failing), [fakeUnitInfo("a", MF), fakeUnitInfo("b", MF)]), batchOf(fakeUpdater(working, update), [fakeUnitInfo("c", MF)])],
      report,
      undefined,
      "report",
    );
    expect(outcome).toBe(true);
    expect(report.failures.map((f) => [f.unitId, f.error])).toEqual([
      ["a", "could not load: Error: gone"],
      ["b", "could not load: Error: gone"],
    ]);
    expect(update).toHaveBeenCalledOnce();
    expect(working.saved).toHaveLength(1);
  });

  it("passes the choice from runUpdater to its batches", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    access.loadError = new Error("gone");
    const report = new JobReport();
    expect(await runUpdater(fakeUpdater(access), report, scope, 2, new UnitInfoCache(), undefined, "report")).toBe(true);
    expect(report.failures).toHaveLength(1);
    expect(await runUpdater(fakeUpdater(access), new JobReport(), scope, 2, new UnitInfoCache())).toBe(
      "Could not load microflows 1-1: Error: gone",
    );
  });
});

describe("buildJobSteps", () => {
  const step = (title: string, outcome: true | string = true) => ({ title, run: vi.fn(async () => outcome) });

  it("makes one step per single step and per implemented updater, in order", () => {
    const access = fakeUnitAccess([]);
    const steps = buildJobSteps(
      [
        { kind: "step", step: step("Preparing"), description: "Loading names" },
        {
          kind: "updaters",
          updaters: [
            fakeUpdater(access, undefined, { label: "Constants", description: "Renaming constants" }),
            fakeUpdater(access, undefined, { label: "Stub", implemented: false }),
            fakeUpdater(access, undefined, { label: "Pages", title: "Renaming pages", description: "Renaming pages" }),
          ],
          batchSize: 100,
          describe: (u) => `${u.description} (ACT_ -> SUB_)`,
        },
        { kind: "updaters", updaters: [fakeUpdater(access, undefined, { label: "References in pages", description: "Updating references" })], batchSize: 100 },
      ],
      new JobReport(),
      scope,
    );
    expect(steps.map((s) => [s.title, s.description])).toEqual([
      ["Preparing", "Loading names"],
      ["Updating constants", "Renaming constants (ACT_ -> SUB_)"],
      ["Renaming pages", "Renaming pages (ACT_ -> SUB_)"],
      ["Updating references in pages", "Updating references"],
    ]);
    expect(access.getUnitsInfoCalls).toBe(0);
  });

  it("runs a step with the report and times it under its title", async () => {
    const report = new JobReport();
    const prepare = step("Preparing", "stop here");
    const [built] = buildJobSteps([{ kind: "step", step: prepare, description: "" }], report, scope);
    expect(await built.action()).toBe("stop here");
    expect(prepare.run).toHaveBeenCalledWith(report);
    expect(report.timings.steps.map((s) => s.title)).toEqual(["Preparing"]);
  });

  it("uses the load failure choice of the stage", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    access.loadError = new Error("gone");
    const report = new JobReport();
    const [built] = buildJobSteps([{ kind: "updaters", updaters: [fakeUpdater(access)], batchSize: 10, onLoadFailure: "report" }], report, scope);
    expect(await built.action()).toBe(true);
    expect(report.hasErrors).toBe(true);
  });
});

describe("runJob", () => {
  it("opens the dialog with the title and runs every step", async () => {
    const runner = fakeProgressRunner();
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const onUnsuccessful = vi.fn();
    const report = new JobReport();
    const { dialog, report: returned } = await runJob(
      [{ kind: "updaters", updaters: [fakeUpdater(access, async () => changed())], batchSize: 10 }],
      { title: "Renaming prefix ACT_ to SUB_", scope, report, runProgress: runner.run, onUnsuccessful },
    );
    expect(runner.titles).toEqual(["Renaming prefix ACT_ to SUB_"]);
    expect(dialog.result).toBe("Success");
    expect(returned).toBe(report);
    expect(report.changedUnits).toBe(1);
    expect(report.timings.dialogMs).not.toBeNull();
    expect(onUnsuccessful).not.toHaveBeenCalled();
  });

  it.each([
    ["UserCancelled", "cancelled by user"],
    ["Failure", "the process failed"],
  ] as const)("tells onUnsuccessful why after %s", async (result, reason) => {
    const onUnsuccessful = vi.fn();
    const report = new JobReport();
    const runner = fakeProgressRunner({ result } as never);
    await runJob([], { title: "t", scope, report, runProgress: runner.run, onUnsuccessful });
    expect(onUnsuccessful).toHaveBeenCalledWith(reason, report);
  });

  it("shares a given listing cache with the steps", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", MF)]);
    const unitInfos = new UnitInfoCache();
    await unitInfos.get(access);
    await runJob([{ kind: "updaters", updaters: [fakeUpdater(access)], batchSize: 10 }], {
      title: "t",
      scope,
      report: new JobReport(),
      runProgress: fakeProgressRunner().run,
      unitInfos,
    });
    expect(access.getUnitsInfoCalls).toBe(1);
  });
});
