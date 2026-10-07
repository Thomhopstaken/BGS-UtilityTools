import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import { BATCH_SIZE, type PlannedBatch, planBatches } from "./RenamePlanner";
import type { RenameContext } from "./RenameContext";
import { RenameReport } from "./RenameReport";
import type { ProgressRunner, UnitUpdater } from "./types";

// The last step of a job; it only runs when every updater step before it has finished.
export interface FinalStep {
  readonly title: string;
  run(report: RenameReport): Promise<true | string>;
}

export type RenameJobDeps = {
  updaters: readonly UnitUpdater[];
  runProgress: ProgressRunner;
  finalStep: FinalStep;
  batchSize?: number;
};

export type RenameJobResult = {
  dialog: ProgressDialogResult;
  report: RenameReport;
};

// Plans the batches, then runs them in the modal progress dialog, which blocks Studio Pro until done.
export async function runRenameJob(deps: RenameJobDeps, context: RenameContext): Promise<RenameJobResult> {
  const report = new RenameReport();
  const batches = await planBatches(deps.updaters, context, deps.batchSize ?? BATCH_SIZE);
  const steps = buildSteps(batches, report, deps.finalStep, context);
  console.info(`starting rename job with ${steps.length} steps`);
  const dialog = await deps.runProgress(`Renaming ${context.oldQualifiedName} to ${context.newName}`, steps);
  console.info(`rename job ended: ${dialog.result}${dialog.failedStep ? ` (${dialog.failedStep.stepTitle}: ${dialog.failedStep.error})` : ""}`);
  if (dialog.result !== "Success" && !report.entityRenamed && report.entitySkipReason === null) {
    report.skipEntity(dialog.result === "UserCancelled" ? "cancelled by user" : "the process failed");
  }
  return { dialog, report };
}

export function unitDisplayName(info: Readonly<Primitives.UnitInfo>): string {
  const name = info.name ?? info.$ID;
  return info.moduleName === undefined ? name : `${info.moduleName}.${name}`;
}

// One step per updater (e.g. "Updating microflows") that runs all its batches.
export function buildSteps(
  batches: readonly PlannedBatch[],
  report: RenameReport,
  finalStep: FinalStep,
  context: RenameContext,
): ProgressDialogStep[] {
  const steps: ProgressDialogStep[] = [];
  for (const [updater, group] of groupByUpdater(batches)) {
    const total = group[0].total;
    steps.push({
      title: `Updating ${updater.label.toLowerCase()}`,
      description: `${updater.description} (${context.oldName} -> ${context.newName}), ${total} documents`,
      action: () => runBatches(group, report),
    });
  }
  steps.push({
    title: finalStep.title,
    description: `${context.oldQualifiedName} -> ${context.newName}`,
    action: () => finalStep.run(report),
  });
  return steps;
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
  const { updater, infos, first, last, total } = batch;
  const infoById = new Map(infos.map((info) => [info.$ID, info]));
  console.info(`${updater.label}: loading ${first}-${last} of ${total}`);
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
