import type { DomainModels, Primitives } from "@mendix/extensions-api";
import type { AssociationRenamePlan } from "../../framework/AssociationRenamePlan";
import type { DocumentNameRegistry } from "../../framework/DocumentNameRegistry";
import type { DocumentRenamePlan } from "../../framework/DocumentRenamePlan";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";
import type { RenameContext } from "../../framework/RenameContext";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult, type UpdaterMode } from "../../framework/types";
import { AssociationNames, applyAssociationRenames, associationsOf, proposedAssociationName } from "./associationRename";
import { reconcileSharedName } from "./sharedNames";

// Shared state of the plan and rename phases of one job.
export type AssociationUpdaterDeps = {
  context: RenameContext;
  naming: NamingPolicy;
  documentNames: DocumentNameRegistry;
  // Document renames planned before the associations; changed when a document shares an association's name.
  documentPlan: DocumentRenamePlan;
  renames: QualifiedNameRenames;
  plan: AssociationRenamePlan;
};

// Associations connected to the entity, in two phases:
// plan   - read-only: decides association renames (after the document planners) and records them.
// rename - renames the planned associations in every domain model except the entity's own one, which the
//          entity step renames in the same save as the entity. References are left to the reference pass.
export class AssociationUpdater implements UnitUpdater<DomainModels.DomainModel> {
  readonly label: string;
  readonly title?: string;
  readonly unitType = "DomainModels$DomainModel";
  readonly implemented = true;
  readonly description: string;
  readonly access: UnitAccess<DomainModels.DomainModel>;
  private readonly mode: UpdaterMode;
  private readonly deps: AssociationUpdaterDeps;

  constructor(mode: UpdaterMode, access: UnitAccess<DomainModels.DomainModel>, deps: AssociationUpdaterDeps) {
    this.mode = mode;
    this.label = mode === "plan" ? "Associations (plan)" : "Associations";
    this.title = mode === "plan" ? "Planning associations" : undefined;
    this.description = mode === "plan" ? "Finding associations to rename" : "Renaming associations";
    this.access = access;
    this.deps = deps;
  }

  accepts(info: Readonly<Primitives.UnitInfo>): boolean {
    if (this.mode === "plan") {
      return true;
    }
    const accepted = info.$ID !== this.deps.context.domainModelId && this.deps.plan.has(info.$ID);
    console.debug(`${this.label}: ${info.moduleName} ${accepted ? "has" : "has no"} association renames to apply`);
    return accepted;
  }

  async update(domainModel: DomainModels.DomainModel, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    console.debug(`${this.mode}: checking associations in ${info.moduleName}`);
    return this.mode === "plan" ? this.plan(domainModel, info) : this.rename(domainModel, info);
  }

  // Changes nothing in the unit; fills the association plan and the rename map, and may change document renames.
  private plan(domainModel: DomainModels.DomainModel, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const { context, naming, documentNames, documentPlan, renames, plan } = this.deps;
    const moduleName = info.moduleName;
    if (moduleName === undefined) {
      console.debug(`domain model ${info.$ID} has no module, skipped`);
      return { ...UNCHANGED };
    }
    const names = new AssociationNames(domainModel, context);
    let planned = 0;
    let skipped = 0;
    for (const association of associationsOf(domainModel)) {
      let target = proposedAssociationName(association, context, naming);
      if (documentNames.existedAtStart(moduleName, association.name)) {
        const outcome = reconcileSharedName({
          moduleName,
          name: association.name,
          associationTarget: target,
          associationNameFree: (name) => names.isFree(name),
          documentNames,
          documentPlan,
          renames,
        });
        target = outcome.associationTarget;
        skipped += outcome.skipped;
      } else if (target !== null && !names.isFree(target)) {
        console.info(`skipped renaming association ${moduleName}.${association.name}: ${target} already exists`);
        target = null;
        skipped++;
      }
      if (target === null) {
        continue;
      }
      names.register(association.name, target);
      plan.set(info.$ID, association.$ID, target);
      renames.addAssociation(moduleName, association.name, target);
      planned++;
    }
    console.info(`planned associations in ${moduleName}: ${planned} renames, ${skipped} skipped`);
    return { ...UNCHANGED, skippedRenames: skipped };
  }

  private rename(domainModel: DomainModels.DomainModel, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const applied = applyAssociationRenames(domainModel, this.deps.plan.get(info.$ID));
    console.info(`${info.moduleName}: ${applied.length} associations renamed`);
    return { ...UNCHANGED, changed: applied.length > 0, renamedAssociations: applied.length };
  }
}
