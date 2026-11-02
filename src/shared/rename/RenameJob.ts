import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import type { JobReport } from "./JobReport";
import type { JobScope } from "./JobScope";
import { BATCH_SIZE, PLAN_BATCH_SIZE, type PlannedBatch, planBatches } from "./RenamePlanner";
import type { ProgressRunner, UnitUpdater } from "./types";
import { UnitInfoCache } from "./UnitInfoCache";

// A single step outside the updaters, e.g. preparing; a message stops the job.
export interface JobStep<R extends JobReport = JobReport> {
  readonly title: string;
  run(report: R): Promise<true | string>;
}

// Sees every unit a planner loaded, after planning it; e.g. to index its references. Must not change the unit.
export type PlanObserver = (unit: Primitives.UnitBase, info: Readonly<Primitives.UnitInfo>) => void;

// A batch that can't load: stop the job, or report its units as failed and go on.
export type LoadFailure = "stop" | "report";

// One step, or one dialog step per implemented updater.
export type JobStage<R extends JobReport = JobReport> =
  | { readonly kind: "step"; readonly step: JobStep<R>; readonly description: string }
  | {
      readonly kind: "updaters";
      readonly updaters: readonly UnitUpdater[];
      readonly batchSize: number;
      readonly observer?: PlanObserver;
      // Dialog step description; the updater's own when absent.
      readonly describe?: (updater: UnitUpdater) => string;
      // "stop" when absent.
      readonly onLoadFailure?: LoadFailure;
    };

// Units per loadAll call: plan steps only read, so they can take bigger batches than the steps that save.
export type BatchSizes = { plan: number; write: number };

export const DEFAULT_BATCH_SIZES: BatchSizes = Object.freeze({ plan: PLAN_BATCH_SIZE, write: BATCH_SIZE });

export type JobOptions<R extends JobReport> = {
  // Progress dialog title.
  readonly title: string;
  readonly scope: JobScope;
  readonly report: R;
  readonly runProgress: ProgressRunner;
  // A fresh one when absent; pass one to share listings with code outside the steps.
  readonly unitInfos?: UnitInfoCache;
  // Cancelled or failed: reason is "cancelled by user" or "the process failed".
  readonly onUnsuccessful?: (reason: string, report: R) => void;
};

export type JobResult<R extends JobReport> = {
  dialog: ProgressDialogResult;
  report: R;
};

// Runs the stages in the modal progress dialog, which blocks Studio Pro until done. Opens the dialog without any model
// API call; each step lists and loads its own units.
export async function runJob<R extends JobReport>(stages: readonly JobStage<R>[], options: JobOptions<R>): Promise<JobResult<R>> {
  const { report } = options;
  const steps = buildJobSteps(stages, report, options.scope, options.unitInfos ?? new UnitInfoCache());
  console.info(`starting rename job with ${steps.length} steps`);
  const dialog = await report.timings.measureDialog(() => options.runProgress(options.title, steps));
  console.info(`rename job ended: ${dialog.result}${dialog.failedStep ? ` (${dialog.failedStep.stepTitle}: ${dialog.failedStep.error})` : ""}`);
  if (dialog.result !== "Success") {
    options.onUnsuccessful?.(dialog.result === "UserCancelled" ? "cancelled by user" : "the process failed", report);
  }
  return { dialog, report };
}

// One dialog step per single step and per implemented updater; stubs get no step. The units of a step are listed
// when the step runs. Every step is timed.
export function buildJobSteps<R extends JobReport>(
  stages: readonly JobStage<R>[],
  report: R,
  scope: JobScope,
  unitInfos: UnitInfoCache = new UnitInfoCache(),
): ProgressDialogStep[] {
  return stages.flatMap((stage): ProgressDialogStep[] => {
    if (stage.kind === "step") {
      const { step } = stage;
      return [{ title: step.title, description: stage.description, action: () => report.timings.measureStep(step.title, () => step.run(report)) }];
    }
    return stage.updaters
      .filter((updater) => updater.implemented)
      .map((updater) => {
        const title = updater.title ?? `Updating ${updater.label.toLowerCase()}`;
        return {
          title,
          description: stage.describe?.(updater) ?? updater.description,
          action: () =>
            report.timings.measureStep(title, () =>
              runUpdater(updater, report, scope, stage.batchSize, unitInfos, stage.observer, stage.onLoadFailure),
            ),
        };
      });
  });
}

// Module.Name for logging; the $ID when the unit has no name.
export function unitDisplayName(info: Readonly<Primitives.UnitInfo>): string {
  const name = info.name ?? info.$ID;
  return info.moduleName === undefined ? name : `${info.moduleName}.${name}`;
}

// Lists the units of one updater in batches, then runs them; a listing failure stops the job. An idle updater lists
// nothing.
export async function runUpdater(
  updater: UnitUpdater,
  report: JobReport,
  scope: JobScope,
  batchSize: number,
  unitInfos: UnitInfoCache,
  observer?: PlanObserver,
  onLoadFailure: LoadFailure = "stop",
): Promise<true | string> {
  if (updater.isIdle?.(report) === true) {
    console.info(`${updater.label}: no work, nothing listed`);
    return true;
  }
  const started = Date.now();
  let batches: PlannedBatch[];
  try {
    batches = await planBatches([updater], scope, batchSize, unitInfos, report);
  } catch (error: unknown) {
    console.info(`${updater.label}: could not list units: ${error}`);
    return `Could not list ${updater.label.toLowerCase()}: ${error}`;
  }
  const outcome = await runBatches(batches, report, observer, onLoadFailure);
  console.info(`${updater.label}: ${batches.length} batches done in ${Date.now() - started} ms`);
  return outcome;
}

// Runs batches in order; stops at the first batch that cannot load, unless load failures are reported.
export async function runBatches(
  batches: readonly PlannedBatch[],
  report: JobReport,
  observer?: PlanObserver,
  onLoadFailure: LoadFailure = "stop",
): Promise<true | string> {
  for (const batch of batches) {
    const outcome = await runBatch(batch, report, observer, onLoadFailure);
    if (outcome !== true) {
      return outcome;
    }
  }
  return true;
}

// Loads one batch, updates and saves each unit; the batch is dropped afterwards so memory stays bounded.
// Unit errors are reported; a load failure stops the job, or with "report" fails each unit of the batch.
// Updaters that work from metadata load nothing. The batch holds only accepted units (planBatches filters them).
export async function runBatch(
  batch: PlannedBatch,
  report: JobReport,
  observer?: PlanObserver,
  onLoadFailure: LoadFailure = "stop",
): Promise<true | string> {
  const { updater, infos, first, last, total } = batch;
  if (infos.length === 0) {
    console.debug(`${updater.label}: nothing to do in ${first}-${last} of ${total}`);
    return true;
  }
  if (updater.updateFromInfo !== undefined) {
    console.info(`${updater.label}: ${infos.length} units of ${first}-${last} of ${total} from metadata, not loaded`);
    infos.forEach((info) => updateFromInfo(updater, info, report));
    return true;
  }
  const infoById = new Map(infos.map((info) => [info.$ID, info]));
  console.info(`${updater.label}: loading ${infos.length} units of ${first}-${last} of ${total}`);
  let units: Primitives.UnitBase[];
  try {
    units = await updater.access.loadAll((info) => infoById.has(info.$ID), infoById.size);
  } catch (error: unknown) {
    console.info(`${updater.label}: could not load batch: ${error}`);
    if (onLoadFailure === "report") {
      infos.forEach((info) => report.addError(updater.label, info, `could not load: ${error}`));
      return true;
    }
    return `Could not load ${updater.label.toLowerCase()} ${first}-${last}: ${error}`;
  }
  if (units.length !== infoById.size) {
    console.info(`${updater.label}: loaded ${units.length} of ${infoById.size} units`);
  }
  for (const unit of units) {
    const info = infoById.get(unit.$ID);
    if (info === undefined) {
      console.debug(`${updater.label}: loaded unit ${unit.$ID} was not requested, ignored`);
      continue;
    }
    await updateUnit(updater, unit, info, report);
    observe(observer, updater, unit, info);
  }
  return true;
}

// A failing observer is logged only: the unit is then just not indexed, which is safe.
function observe(
  observer: PlanObserver | undefined,
  updater: UnitUpdater,
  unit: Primitives.UnitBase,
  info: Readonly<Primitives.UnitInfo>,
): void {
  if (observer === undefined) {
    return;
  }
  try {
    observer(unit, info);
  } catch (error: unknown) {
    console.info(`${updater.label}: observing ${unitDisplayName(info)} failed: ${error}`);
  }
}

// Planning from metadata only; it never changes a unit, so there is nothing to save.
function updateFromInfo(updater: UnitUpdater, info: Readonly<Primitives.UnitInfo>, report: JobReport): void {
  try {
    report.addResult(updater.label, info, updater.updateFromInfo!(info));
  } catch (error: unknown) {
    report.addError(updater.label, info, error);
  }
}

// Updates one unit and saves it when changed; errors go to the report.
export async function updateUnit(
  updater: UnitUpdater,
  unit: Primitives.UnitBase,
  info: Readonly<Primitives.UnitInfo>,
  report: JobReport,
): Promise<void> {
  console.debug(`${updater.label}: updating ${unitDisplayName(info)}`);
  try {
    const result = await updater.update(unit, info);
    if (result.changed) {
      await updater.access.save(unit);
      console.info(`${updater.label}: saved ${info.moduleName}.${result.renamedTo ?? info.name}`);
    }
    report.addResult(updater.label, info, result);
  } catch (error: unknown) {
    report.addError(updater.label, info, error);
  }
}
