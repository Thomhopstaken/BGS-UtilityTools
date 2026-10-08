import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import { BATCH_SIZE, type PlannedBatch, planBatches } from "./RenamePlanner";
import type { RenameContext } from "./RenameContext";
import { RenameReport } from "./RenameReport";
import type { ProgressRunner, UnitUpdater } from "./types";
import { UnitInfoCache } from "./UnitInfoCache";

// A single step outside the updaters: preparing, or renaming the entity.
export interface EntityStep {
  readonly title: string;
  run(report: RenameReport): Promise<true | string>;
}

export type JobSteps = {
  // First step: validation and loading what the updaters need; changes nothing.
  prepare: EntityStep;
  // Read-only; decide every rename before anything is changed.
  planners: readonly UnitUpdater[];
  // Renames the entity; runs after planning and before any document is changed.
  entityStep: EntityStep;
  // Run after the entity rename, in order: declarations (documents, parameters, variables), references, refresh.
  updaters: readonly UnitUpdater[];
};

export type RenameJobDeps = JobSteps & {
  runProgress: ProgressRunner;
  batchSize?: number;
};

export type RenameJobResult = {
  dialog: ProgressDialogResult;
  report: RenameReport;
};

// Runs the job in the modal progress dialog, which blocks Studio Pro until done. Opens the dialog without any model
// API call; each step lists and loads its own units.
// Order: prepare -> plan (read-only) -> rename entity -> rename declarations -> update references. Every document gets
// its last save after all names it references exist, because Studio Pro checks a document only when it is saved.
export async function runRenameJob(deps: RenameJobDeps, context: RenameContext): Promise<RenameJobResult> {
  const report = new RenameReport();
  const steps = buildSteps(deps, report, context, deps.batchSize ?? BATCH_SIZE, new UnitInfoCache());
  console.info(`starting rename job with ${steps.length} steps`);
  const dialog = await deps.runProgress(`Renaming ${context.oldQualifiedName} to ${context.newName}`, steps);
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
// implemented updater. Stubs get no step. The units of a step are listed when the step runs.
export function buildSteps(
  job: JobSteps,
  report: RenameReport,
  context: RenameContext,
  batchSize: number = BATCH_SIZE,
  unitInfos: UnitInfoCache = new UnitInfoCache(),
): ProgressDialogStep[] {
  const single = (step: EntityStep, description: string): ProgressDialogStep => ({
    title: step.title,
    description,
    action: () => step.run(report),
  });
  const perUpdater = (updaters: readonly UnitUpdater[]): ProgressDialogStep[] =>
    updaters
      .filter((updater) => updater.implemented)
      .map((updater) => ({
        title: updater.title ?? `Updating ${updater.label.toLowerCase()}`,
        description: `${updater.description} (${context.oldName} -> ${context.newName})`,
        action: () => runUpdater(updater, report, context, batchSize, unitInfos),
      }));
  return [
    single(job.prepare, `Checking ${context.oldQualifiedName} and loading document names`),
    ...perUpdater(job.planners),
    single(job.entityStep, `${context.oldQualifiedName} -> ${context.newName}`),
    ...perUpdater(job.updaters),
  ];
}

// Lists the units of one updater in batches, then runs them; a listing failure stops the job.
export async function runUpdater(
  updater: UnitUpdater,
  report: RenameReport,
  context: RenameContext,
  batchSize: number,
  unitInfos: UnitInfoCache,
): Promise<true | string> {
  const started = Date.now();
  let batches: PlannedBatch[];
  try {
    batches = await planBatches([updater], context, batchSize, unitInfos);
  } catch (error: unknown) {
    console.info(`${updater.label}: could not list units: ${error}`);
    return `Could not list ${updater.label.toLowerCase()}: ${error}`;
  }
  const outcome = await runBatches(batches, report);
  console.info(`${updater.label}: ${batches.length} batches done in ${Date.now() - started} ms`);
  return outcome;
}

// Runs batches in order; stops at the first batch that cannot load.
export async function runBatches(batches: readonly PlannedBatch[], report: RenameReport): Promise<true | string> {
  for (const batch of batches) {
    const outcome = await runBatch(batch, report);
    if (outcome !== true) {
      return outcome;
    }
  }
  return true;
}

// Loads one batch, updates and saves each unit; the batch is dropped afterwards so memory stays bounded.
// Unit errors are reported, only a load failure stops the job.
export async function runBatch(batch: PlannedBatch, report: RenameReport): Promise<true | string> {
  const { updater, first, last, total } = batch;
  const infos = updater.accepts === undefined ? batch.infos : batch.infos.filter((info) => updater.accepts!(info, report));
  if (infos.length === 0) {
    console.debug(`${updater.label}: nothing to do in ${first}-${last} of ${total}`);
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
  }
  return true;
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
