import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import { BATCH_SIZE, PLAN_BATCH_SIZE, type PlannedBatch, planBatches } from "./RenamePlanner";
import type { RenameContext } from "./RenameContext";
import { RenameReport } from "./RenameReport";
import type { ProgressRunner, UnitUpdater } from "./types";
import { UnitInfoCache } from "./UnitInfoCache";

// A single step outside the updaters: preparing, or renaming the entity.
export interface EntityStep {
  readonly title: string;
  run(report: RenameReport): Promise<true | string>;
}

// Sees every unit a planner loaded, after planning it; e.g. to index its references. Must not change the unit.
export type PlanObserver = (unit: Primitives.UnitBase, info: Readonly<Primitives.UnitInfo>) => void;

export type JobSteps = {
  // First step: validation and loading what the updaters need; changes nothing.
  prepare: EntityStep;
  // Read-only; decide every rename before anything is changed.
  planners: readonly UnitUpdater[];
  planObserver?: PlanObserver;
  // Renames the entity; runs after planning and before any document is changed.
  entityStep: EntityStep;
  // Run after the entity rename, in order: declarations (documents, parameters, variables), references, refresh.
  updaters: readonly UnitUpdater[];
};

// Units per loadAll call: plan steps only read, so they can take bigger batches than the steps that save.
export type BatchSizes = { plan: number; write: number };

export const DEFAULT_BATCH_SIZES: BatchSizes = Object.freeze({ plan: PLAN_BATCH_SIZE, write: BATCH_SIZE });

export type RenameJobDeps = JobSteps & {
  runProgress: ProgressRunner;
  // Write steps; plan steps use planBatchSize.
  batchSize?: number;
  planBatchSize?: number;
};

export type RenameJobResult = {
  dialog: ProgressDialogResult;
  report: RenameReport;
};

// Runs the job in the modal progress dialog, which blocks Studio Pro until done. Opens the dialog without any model
// API call; each step lists and loads its own units.
// Order: prepare -> plan (read-only) -> rename entity -> rename declarations -> update references. Every document gets
// its last save after all names it references exist, because Studio Pro checks a document only when it is saved.
// report: pass one when updaters fill it directly (e.g. message definition usage); a fresh one otherwise.
export async function runRenameJob(
  deps: RenameJobDeps,
  context: RenameContext,
  report: RenameReport = new RenameReport(),
): Promise<RenameJobResult> {
  const batchSizes = { plan: deps.planBatchSize ?? PLAN_BATCH_SIZE, write: deps.batchSize ?? BATCH_SIZE };
  const steps = buildSteps(deps, report, context, batchSizes, new UnitInfoCache());
  console.info(`starting rename job with ${steps.length} steps`);
  const dialog = await report.timings.measureDialog(() => deps.runProgress(`Renaming ${context.oldQualifiedName} to ${context.newName}`, steps));
  console.info(`rename job ended: ${dialog.result}${dialog.failedStep ? ` (${dialog.failedStep.stepTitle}: ${dialog.failedStep.error})` : ""}`);
  if (dialog.result !== "Success") {
    const reason = dialog.result === "UserCancelled" ? "cancelled by user" : "the process failed";
    if (report.entityRenamed) {
      report.markIncomplete(`${reason}; the entity was renamed but the remaining documents were not updated, check the error list`);
    } else if (report.entitySkipReason === null) {
      report.skipEntity(`${reason}; nothing was changed`);
    }
  }
  return { dialog, report };
}

export function unitDisplayName(info: Readonly<Primitives.UnitInfo>): string {
  const name = info.name ?? info.$ID;
  return info.moduleName === undefined ? name : `${info.moduleName}.${name}`;
}

// Prepare, one step per implemented planner (e.g. "Planning microflows"), the entity step, then one step per
// implemented updater. Stubs get no step. The units of a step are listed when the step runs. Every step is timed.
export function buildSteps(
  job: JobSteps,
  report: RenameReport,
  context: RenameContext,
  batchSizes: BatchSizes = DEFAULT_BATCH_SIZES,
  unitInfos: UnitInfoCache = new UnitInfoCache(),
): ProgressDialogStep[] {
  const single = (step: EntityStep, description: string): ProgressDialogStep => ({
    title: step.title,
    description,
    action: () => report.timings.measureStep(step.title, () => step.run(report)),
  });
  const perUpdater = (updaters: readonly UnitUpdater[], batchSize: number, observer?: PlanObserver): ProgressDialogStep[] =>
    updaters
      .filter((updater) => updater.implemented)
      .map((updater) => {
        const title = updater.title ?? `Updating ${updater.label.toLowerCase()}`;
        return {
          title,
          description: `${updater.description} (${context.oldName} -> ${context.newName})`,
          action: () => report.timings.measureStep(title, () => runUpdater(updater, report, context, batchSize, unitInfos, observer)),
        };
      });
  return [
    single(job.prepare, `Checking ${context.oldQualifiedName} and loading document names`),
    ...perUpdater(job.planners, batchSizes.plan, job.planObserver),
    single(job.entityStep, `${context.oldQualifiedName} -> ${context.newName}`),
    ...perUpdater(job.updaters, batchSizes.write),
  ];
}

// Lists the units of one updater in batches, then runs them; a listing failure stops the job.
export async function runUpdater(
  updater: UnitUpdater,
  report: RenameReport,
  context: RenameContext,
  batchSize: number,
  unitInfos: UnitInfoCache,
  observer?: PlanObserver,
): Promise<true | string> {
  const started = Date.now();
  let batches: PlannedBatch[];
  try {
    batches = await planBatches([updater], context, batchSize, unitInfos, report);
  } catch (error: unknown) {
    console.info(`${updater.label}: could not list units: ${error}`);
    return `Could not list ${updater.label.toLowerCase()}: ${error}`;
  }
  const outcome = await runBatches(batches, report, observer);
  console.info(`${updater.label}: ${batches.length} batches done in ${Date.now() - started} ms`);
  return outcome;
}

// Runs batches in order; stops at the first batch that cannot load.
export async function runBatches(batches: readonly PlannedBatch[], report: RenameReport, observer?: PlanObserver): Promise<true | string> {
  for (const batch of batches) {
    const outcome = await runBatch(batch, report, observer);
    if (outcome !== true) {
      return outcome;
    }
  }
  return true;
}

// Loads one batch, updates and saves each unit; the batch is dropped afterwards so memory stays bounded.
// Unit errors are reported, only a load failure stops the job. Updaters that work from metadata load nothing.
// The batch holds only accepted units (planBatches filters them).
export async function runBatch(batch: PlannedBatch, report: RenameReport, observer?: PlanObserver): Promise<true | string> {
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
function updateFromInfo(updater: UnitUpdater, info: Readonly<Primitives.UnitInfo>, report: RenameReport): void {
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
  report: RenameReport,
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
