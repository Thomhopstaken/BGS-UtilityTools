import type { DomainModels, Primitives, ProgressDialogResult, Security } from "@mendix/extensions-api";
import { JobReport } from "../shared/rename/JobReport";
import type { JobScope } from "../shared/rename/JobScope";
import { instrumentModel } from "../shared/rename/JobTimings";
import { loadInScope } from "../shared/rename/loadInScope";
import { QualifiedNameRenames } from "../shared/rename/QualifiedNameRenames";
import { ReferenceIndex } from "../shared/rename/ReferenceIndex";
import type { AppModel } from "../shared/rename/referenceTypes";
import type { RenamedDocumentNames } from "../shared/rename/RenamedDocumentNames";
import { type JobStage, runJob } from "../shared/rename/RenameJob";
import { BATCH_SIZE } from "../shared/rename/RenamePlanner";
import type { ProgressRunner, UnitAccess, UnitUpdater } from "../shared/rename/types";
import { UnitInfoCache } from "../shared/rename/UnitInfoCache";
import { groupLabel, typesOfGroup } from "./documentTypes";
import type { InModule } from "./framework/domainNames";
import { MarketplaceScanStep } from "./framework/MarketplaceScanStep";
import { PrefixJobState } from "./framework/PrefixJobState";
import { PrefixPlan } from "./framework/PrefixPlan";
import { PrefixPlanStep } from "./framework/PrefixPlanStep";
import { PrefixPrepareStep } from "./framework/PrefixPrepareStep";
import { RenameCheckStep } from "./framework/RenameCheckStep";
import type { PrefixChange } from "./prefixRename";
import { createPrefixUpdaters } from "./updaters/updaterRegistry";

export type PrefixServiceDeps = {
  readonly model: AppModel;
  readonly runProgress: ProgressRunner;
  // App Store modules and System.
  readonly excludedModules: ReadonlySet<string>;
  // This session's renames, put over the stale modules tree; the run's saved renames are added.
  readonly renamedNames: RenamedDocumentNames;
};

export type PrefixRunResult = {
  readonly dialog: ProgressDialogResult;
  readonly report: JobReport;
  readonly plan: PrefixPlan;
  readonly change: PrefixChange;
};

// Progress dialog title, e.g. "Renaming prefix ACT_ to SUB_ (Microflows & nanoflows)".
export function jobTitle(change: PrefixChange): string {
  const label = groupLabel(change.group);
  return change.newPrefix === null
    ? `Removing prefix ${change.oldPrefix}_ (${label})`
    : `Renaming prefix ${change.oldPrefix}_ to ${change.newPrefix}_ (${label})`;
}

// Wires the job for one prefix change and runs it in the progress dialog:
// prepare -> Marketplace scan -> plan (read-only) -> rename -> check -> references.
export async function runPrefixRename(deps: PrefixServiceDeps, change: PrefixChange): Promise<PrefixRunResult> {
  const report = new JobReport();
  const model = instrumentModel(deps.model, report.timings);
  const scope: JobScope = { excludedModules: deps.excludedModules };
  const state = new PrefixJobState();
  const plan = new PrefixPlan();
  const renames = new QualifiedNameRenames();
  const unitInfos = new UnitInfoCache();
  const updaters = createPrefixUpdaters(model, { plan, renames, index: new ReferenceIndex(), isSaved: (id) => report.wasChanged(id) });
  // Only the chosen group's renamers, so the dialog shows no empty steps.
  const groupTypes = new Set(typesOfGroup(change.group).map((type) => type.unitType));
  const renamers = updaters.renamers.filter((updater) => groupTypes.has(updater.unitType));
  const describe = (updater: UnitUpdater) => `${updater.description} (${change.oldPrefix}_ -> ${change.newPrefix === null ? "no prefix" : `${change.newPrefix}_`})`;
  const stages: JobStage[] = [
    {
      kind: "step",
      step: new PrefixPrepareStep({
        getModulesTree: async () => deps.renamedNames.correct(await model.projects.getModulesTree()),
        loadDomainModels: () => loadOwn<DomainModels.DomainModel>(model.domainModels, "DomainModels$DomainModel", unitInfos, scope),
        loadModuleSecurities: () => loadOwn<Security.ModuleSecurity>(model.moduleSecurity, "Security$ModuleSecurity", unitInfos, scope),
        listUnits: () => listUnits([...renamers, ...updaters.referenceUpdaters], unitInfos),
        scope,
        change,
        state,
      }),
      description: "Loading document names, entities and module roles",
    },
    {
      kind: "step",
      step: new MarketplaceScanStep({ sources: updaters.scanSources, unitInfos, state }),
      description: "Finding renamed documents used by Marketplace modules",
    },
    { kind: "step", step: new PrefixPlanStep({ state, change, plan, renames }), description: "Deciding which documents get a new name" },
    { kind: "updaters", updaters: renamers, batchSize: BATCH_SIZE, describe, onLoadFailure: "report" },
    { kind: "step", step: new RenameCheckStep(plan, renames), description: "Keeping old names for documents that were not renamed" },
    { kind: "updaters", updaters: updaters.referenceUpdaters, batchSize: BATCH_SIZE, describe, onLoadFailure: "report" },
  ];
  const started = Date.now();
  // Also after a failure: what was saved is renamed.
  const { dialog } = await runJob(stages, {
    title: jobTitle(change),
    scope,
    report,
    runProgress: deps.runProgress,
    unitInfos,
    onUnsuccessful: (reason) => {
      if (report.changedUnits > 0) {
        report.markIncomplete(
          `${reason}; renamed documents keep their new names, but references to them may still use the old names. Fix them by hand or revert through version control`,
        );
      }
    },
  }).finally(() => deps.renamedNames.record(report.renamedDocuments));
  console.info(`prefix rename ran in ${Date.now() - started} ms: ${dialog.result}, ${plan.size} planned`);
  return { dialog, report, plan, change };
}

async function loadOwn<TUnit extends Primitives.UnitBase>(
  access: unknown,
  unitType: string,
  unitInfos: UnitInfoCache,
  scope: JobScope,
): Promise<InModule<TUnit>[]> {
  const loaded = await loadInScope(access as UnitAccess<TUnit>, unitType, unitInfos, scope);
  return loaded.map(({ info, unit }) => ({ moduleName: info.moduleName ?? "", unit }));
}

// Lists every API the updaters use, once each; unit ids per unit type.
async function listUnits(updaters: readonly UnitUpdater[], unitInfos: UnitInfoCache): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const listed = new Map<string, Set<string>>();
  for (const access of new Set(updaters.map((updater) => updater.access))) {
    for (const info of await unitInfos.get(access)) {
      const ids = listed.get(info.$Type) ?? new Set<string>();
      ids.add(info.$ID);
      listed.set(info.$Type, ids);
    }
  }
  console.info(`listed ${[...listed.values()].reduce((n, ids) => n + ids.size, 0)} units of ${listed.size} types`);
  return listed;
}
