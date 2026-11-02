import type { DomainModels, Primitives } from "@mendix/extensions-api";
import { applyAssociationRenames } from "../updaters/domainModels/associationRename";
import { rewriteQualifiedNamesInUnit } from "../updaters/shared/qualifiedNameRewrite";
import type { AssociationRenamePlan } from "./AssociationRenamePlan";
import type { EntityStep } from "./RenameJob";
import type { RenameContext } from "./RenameContext";
import type { RenameReport } from "./RenameReport";

// The part of app.model.domainModels the entity rename needs.
export interface DomainModelAccess {
  load<TElement extends Primitives.ElementBase>(type: TElement["$Type"], elementId: string): Promise<TElement | null>;
  save<TElement extends Primitives.ElementBase>(element: TElement): Promise<void>;
}

// Renames the entity itself and the associations planned in its domain model, after planning and before any
// document is changed, so every document saved later references existing names. References to the entity and
// those associations inside its own domain model (access rules, generalizations) are rewritten in the same save;
// the reference pass handles the rest of that domain model.
export class EntityRenameStep implements EntityStep {
  readonly title = "Rename entity";
  private readonly domainModels: DomainModelAccess;
  private readonly context: RenameContext;
  private readonly associationPlan: AssociationRenamePlan;

  constructor(domainModels: DomainModelAccess, context: RenameContext, associationPlan: AssociationRenamePlan) {
    this.domainModels = domainModels;
    this.context = context;
    this.associationPlan = associationPlan;
  }

  // Checks against a freshly loaded domain model; returns an error message, or null when the rename can go ahead.
  async validate(): Promise<string | null> {
    const domainModel = await this.loadDomainModel();
    if (domainModel === null) {
      return `Domain model of ${this.context.moduleName} not found.`;
    }
    return findEntityProblem(domainModel, this.context);
  }

  // Returns a message (which stops the job) when planning failed or the rename is not possible; nothing is changed then.
  async run(report: RenameReport): Promise<true | string> {
    if (report.hasErrors) {
      const reason = `${report.failures.length} documents could not be checked; nothing was changed`;
      report.skipEntity(reason);
      return reason;
    }
    const domainModel = await this.loadDomainModel();
    if (domainModel === null) {
      const reason = `Domain model of ${this.context.moduleName} not found.`;
      report.skipEntity(reason);
      return reason;
    }
    const problem = findEntityProblem(domainModel, this.context);
    if (problem !== null) {
      report.skipEntity(problem);
      return problem;
    }
    const entity = domainModel.entities.find((e) => e.$ID === this.context.entityId)!;
    const sourceDocument = viewEntitySourceDocument(entity);
    entity.name = this.context.newName;
    const associations = applyAssociationRenames(domainModel, this.associationPlan.get(this.context.domainModelId));
    const ownRenames = new Map([[this.context.oldQualifiedName, this.context.newQualifiedName]]);
    for (const association of associations) {
      ownRenames.set(`${this.context.moduleName}.${association.oldName}`, `${this.context.moduleName}.${association.newName}`);
    }
    const references = rewriteQualifiedNamesInUnit(domainModel, ownRenames) - keepViewEntitySource(entity, sourceDocument);
    await this.domainModels.save(domainModel);
    report.updatedReferences += references;
    report.renamedAssociations += associations.length;
    report.entityRenamed = true;
    console.info(
      `renamed entity ${this.context.oldQualifiedName} to ${this.context.newName} and ${associations.length} associations, ${references} references in its domain model updated`,
    );
    return true;
  }

  // Loaded fresh: the copy the pane loaded at startup may be stale.
  private async loadDomainModel(): Promise<DomainModels.DomainModel | null> {
    const domainModel = await this.domainModels.load<DomainModels.DomainModel>(
      "DomainModels$DomainModel",
      this.context.domainModelId,
    );
    console.debug(`loaded domain model ${this.context.domainModelId}: ${domainModel === null ? "not found" : "found"}`);
    return domainModel;
  }
}

function oqlViewSource(entity: DomainModels.Entity): DomainModels.OqlViewEntitySource | null {
  const source = entity.source as DomainModels.OqlViewEntitySource | null | undefined;
  return source?.$Type === "DomainModels$OqlViewEntitySource" ? source : null;
}

function viewEntitySourceDocument(entity: DomainModels.Entity): string | null {
  return oqlViewSource(entity)?.sourceDocument ?? null;
}

// A view entity keeps pointing to its source document until the document is renamed; the domain model reference pass
// rewrites it then. Returns 1 when a rewrite was undone, so it is not counted.
function keepViewEntitySource(entity: DomainModels.Entity, sourceDocument: string | null): number {
  const source = oqlViewSource(entity);
  if (sourceDocument === null || source === null || source.sourceDocument === sourceDocument) {
    return 0;
  }
  console.info(`view entity ${entity.name}: source document kept as ${sourceDocument} until it is renamed`);
  source.sourceDocument = sourceDocument;
  return 1;
}

export function findEntityProblem(domainModel: DomainModels.DomainModel, context: RenameContext): string | null {
  if (!domainModel.entities.some((e) => e.$ID === context.entityId)) {
    return `Entity ${context.oldQualifiedName} not found in its domain model.`;
  }
  if (domainModel.entities.some((e) => e.$ID !== context.entityId && e.name === context.newName)) {
    return `An entity named ${context.moduleName}.${context.newName} already exists.`;
  }
  return null;
}
