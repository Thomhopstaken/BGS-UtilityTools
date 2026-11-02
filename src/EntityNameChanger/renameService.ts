import type { Primitives, ProgressDialogResult } from "@mendix/extensions-api";
import { AssociationRenamePlan } from "./framework/AssociationRenamePlan";
import { DocumentNameRegistry } from "./framework/DocumentNameRegistry";
import { EntityRenameStep } from "./framework/EntityRenameStep";
import { instrumentModel } from "./framework/JobTimings";
import { PrepareStep } from "./framework/PrepareStep";
import { QualifiedNameRenames } from "./framework/QualifiedNameRenames";
import { createRenameContext, isInScope, type RenameContext } from "./framework/RenameContext";
import { runRenameJob } from "./framework/RenameJob";
import { RenameReport } from "./framework/RenameReport";
import type { ProgressRunner } from "./framework/types";
import { type AppModel, createUpdaters } from "./updaters/updaterRegistry";
import type { EntityOption } from "./entityPicker";
import { findTakenEntityName } from "./validation";

export type RenameRequest = {
  readonly entity: EntityOption;
  readonly newName: string;
  // Also rename exposed names in published services; off when absent.
  readonly renameExposedNames?: boolean;
};

export type RenameServiceDeps = {
  readonly model: AppModel;
  readonly runProgress: ProgressRunner;
  // App Store modules and System.
  readonly excludedModules: ReadonlySet<string>;
  readonly allEntityNames: readonly string[];
  // Names of the entities in the entity's own module, as loaded in the pane.
  readonly entityNamesInModule: readonly string[];
};

export type RenameRunResult =
  | { readonly kind: "rejected"; readonly message: string }
  | { readonly kind: "ran"; readonly dialog: ProgressDialogResult; readonly report: RenameReport; readonly context: RenameContext };

// Units of one model API in the app's own modules; listed only, never loaded.
export async function countInScope(
  access: { getUnitsInfo(): Promise<readonly Readonly<Primitives.UnitInfo>[]> },
  context: RenameContext,
): Promise<number> {
  const count = (await access.getUnitsInfo()).filter((info) => isInScope(info, context)).length;
  console.debug(`units in scope: ${count}`);
  return count;
}

// Whether a unit was saved so far in the job: a changed unit was saved (a failed save is reported as an error), and the
// entity step saves the entity's domain model.
export function savedInJob(report: RenameReport, context: RenameContext): (unitId: string) => boolean {
  return (unitId) => report.wasChanged(unitId) || (unitId === context.domainModelId && report.entityRenamed);
}

// Wires the framework for one rename and runs it in the progress dialog. A quick name check first, so the
// common mistake is reported without opening the dialog.
export async function runEntityRename(deps: RenameServiceDeps, request: RenameRequest): Promise<RenameRunResult> {
  const { entity, newName } = request;
  const taken = findTakenEntityName(deps.entityNamesInModule, entity.moduleName, newName);
  if (taken !== null) {
    console.info(`rename rejected: ${taken}`);
    return { kind: "rejected", message: taken };
  }
  const context = createRenameContext({
    entityId: entity.id,
    domainModelId: entity.domainModelId,
    moduleName: entity.moduleName,
    oldName: entity.name,
    newName,
    excludedModules: deps.excludedModules,
    allEntityNames: deps.allEntityNames,
    renameExposedNames: request.renameExposedNames ?? false,
  });
  // Created here so the mapping planners can fill its message definition usage, and the model can time its calls.
  const jobReport = new RenameReport();
  const model = instrumentModel(deps.model, jobReport.timings);
  const associationPlan = new AssociationRenamePlan();
  const entityStep = new EntityRenameStep(model.domainModels, context, associationPlan);
  // Filled by the prepare step inside the dialog.
  const documentNames = new DocumentNameRegistry();
  const prepare = new PrepareStep({
    validate: () => entityStep.validate(),
    getModulesTree: () => model.projects.getModulesTree(),
    countDocumentTemplates: () => countInScope(model.documentTemplates, context),
    documentNames,
  });
  const groups = createUpdaters(model, {
    context,
    documentNames,
    renames: QualifiedNameRenames.forEntity(context),
    associationPlan,
    messageDefinitionUsage: jobReport.messageDefinitionUsage,
    isSaved: savedInJob(jobReport, context),
  });
  const started = Date.now();
  const { dialog, report } = await runRenameJob(
    {
      prepare,
      planners: groups.planners,
      planObserver: groups.planObserver,
      entityStep,
      updaters: [...groups.renamers, ...groups.referenceUpdaters, ...groups.refreshers],
      runProgress: (title, steps) => {
        console.info(`opening progress dialog ${Date.now() - started} ms after the start`);
        return deps.runProgress(title, steps);
      },
    },
    context,
    jobReport,
  );
  console.info(`rename ran in ${Date.now() - started} ms: ${dialog.result}`);
  return { kind: "ran", dialog, report, context };
}
