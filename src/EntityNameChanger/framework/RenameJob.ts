import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import { BATCH_SIZE, type PlannedBatch, planBatches } from "./RenamePlanner";
import type { RenameContext } from "./RenameContext";
import { RenameReport } from "./RenameReport";
import type { ProgressRunner, UnitUpdater } from "./types";

// Renames the entity; runs after planning and before any document is changed.
export interface EntityStep {
  readonly title: string;
  run(report: RenameReport): Promise<true | string>;
}

export type RenameJobDeps = {
  // Read-only; decide every rename before anything is changed.
  planners: readonly UnitUpdater[];
  entityStep: EntityStep;
  // Run after the entity rename, in order: declarations (documents, parameters, variables), references, refresh.
  updaters: readonly UnitUpdater[];
  runProgress: ProgressRunner;
  batchSize?: number;
};

export type RenameJobResult = {
  dialog: ProgressDialogResult;
  report: RenameReport;
};

// Plans the batches, then runs them in the modal progress dialog, which blocks Studio Pro until done.
// Order: plan (read-only) -> rename entity -> rename declarations -> update references. Every document gets its
// last save after all names it references exist, because Studio Pro checks a document only when it is saved.
export async function runRenameJob(deps: RenameJobDeps, context: RenameContext): Promise<RenameJobResult> {
  const report = new RenameReport();
  const batchSize = deps.batchSize ?? BATCH_SIZE;
  const planBatchList = await planBatches(deps.planners, context, batchSize);
  const updateBatchList = await planBatches(deps.updaters, context, batchSize);
  const steps = buildSteps(planBatchList, deps.entityStep, updateBatchList, report, context);
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

// One step per updater (e.g. "Planning microflows", "Updating microflows") that runs all its batches; the entity
// step sits between the planners and the updaters.
export function buildSteps(
  planBatchList: readonly PlannedBatch[],
  entityStep: EntityStep,
  updateBatchList: readonly PlannedBatch[],
  report: RenameReport,
  context: RenameContext,
): ProgressDialogStep[] {
  const stepsFor = (batches: readonly PlannedBatch[]): ProgressDialogStep[] =>
    [...groupByUpdater(batches)].map(([updater, group]) => ({
      title: updater.title ?? `Updating ${updater.label.toLowerCase()}`,
      description: `${updater.description} (${context.oldName} -> ${context.newName}), ${group[0].total} documents`,
      action: () => runBatches(group, report),
    }));
  return [
    ...stepsFor(planBatchList),
    {
      title: entityStep.title,
      description: `${context.oldQualifiedName} -> ${context.newName}`,
      action: () => entityStep.run(report),
    },
    ...stepsFor(updateBatchList),
  ];
}

// Keeps planner order; a Map iterates in insertion order.
export function groupByUpdater(batches: readonly PlannedBatch[]): Map<UnitUpdater, PlannedBatch[]> {
  const groups = new Map<UnitUpdater, PlannedBatch[]>();
  for (const batch of batches) {
    const group = groups.get(batch.updater);
    if (group === undefined) {
      groups.set(batch.updater, [batch]);
    } else {
      group.push(batch);
    }
  }
  return groups;
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
