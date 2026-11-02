import type { ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import {
  type BatchSizes,
  buildJobSteps,
  DEFAULT_BATCH_SIZES,
  type JobStage,
  type JobStep,
  type PlanObserver,
  runJob,
} from "../../shared/rename/RenameJob";
import { BATCH_SIZE, PLAN_BATCH_SIZE } from "../../shared/rename/RenamePlanner";
import type { ProgressRunner, UnitUpdater } from "../../shared/rename/types";
import { UnitInfoCache } from "../../shared/rename/UnitInfoCache";
import type { RenameContext } from "./RenameContext";
import { RenameReport } from "./RenameReport";

export type JobSteps = {
  // First step: validation and loading what the updaters need; changes nothing.
  prepare: JobStep<RenameReport>;
  // Read-only; decide every rename before anything is changed.
  planners: readonly UnitUpdater[];
  planObserver?: PlanObserver;
  // Renames the entity; runs after planning and before any document is changed.
  entityStep: JobStep<RenameReport>;
  // Run after the entity rename, in order: declarations (documents, parameters, variables), references, refresh.
  updaters: readonly UnitUpdater[];
};

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

// Runs the entity rename in the progress dialog.
// Order: prepare -> plan (read-only) -> rename entity -> rename declarations -> update references. Every document gets
// its last save after all names it references exist, because Studio Pro checks a document only when it is saved.
// report: pass one when updaters fill it directly (e.g. message definition usage); a fresh one otherwise.
export async function runRenameJob(
  deps: RenameJobDeps,
  context: RenameContext,
  report: RenameReport = new RenameReport(),
): Promise<RenameJobResult> {
  const batchSizes = { plan: deps.planBatchSize ?? PLAN_BATCH_SIZE, write: deps.batchSize ?? BATCH_SIZE };
  return runJob(entityStages(deps, context, batchSizes), {
    title: `Renaming ${context.oldQualifiedName} to ${context.newName}`,
    scope: context,
    report,
    runProgress: deps.runProgress,
    unitInfos: new UnitInfoCache(),
    onUnsuccessful: (reason) => {
      if (report.entityRenamed) {
        report.markIncomplete(`${reason}; the entity was renamed but the remaining documents were not updated, check the error list`);
      } else if (report.entitySkipReason === null) {
        report.skipEntity(`${reason}; nothing was changed`);
      }
    },
  });
}

// Prepare, one step per implemented planner (e.g. "Planning microflows"), the entity step, then one step per
// implemented updater.
export function buildSteps(
  job: JobSteps,
  report: RenameReport,
  context: RenameContext,
  batchSizes: BatchSizes = DEFAULT_BATCH_SIZES,
  unitInfos: UnitInfoCache = new UnitInfoCache(),
): ProgressDialogStep[] {
  return buildJobSteps(entityStages(job, context, batchSizes), report, context, unitInfos);
}

function entityStages(job: JobSteps, context: RenameContext, batchSizes: BatchSizes): JobStage<RenameReport>[] {
  const describe = (updater: UnitUpdater) => `${updater.description} (${context.oldName} -> ${context.newName})`;
  return [
    { kind: "step", step: job.prepare, description: `Checking ${context.oldQualifiedName} and loading document names` },
    { kind: "updaters", updaters: job.planners, batchSize: batchSizes.plan, observer: job.planObserver, describe },
    { kind: "step", step: job.entityStep, description: `${context.oldQualifiedName} -> ${context.newName}` },
    { kind: "updaters", updaters: job.updaters, batchSize: batchSizes.write, describe },
  ];
}
