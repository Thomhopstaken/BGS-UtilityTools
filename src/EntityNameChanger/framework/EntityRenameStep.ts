import type { DomainModels, Primitives } from "@mendix/extensions-api";
import type { FinalStep } from "./RenameJob";
import type { RenameContext } from "./RenameContext";
import type { RenameReport } from "./RenameReport";

// The part of app.model.domainModels the entity rename needs.
export interface DomainModelAccess {
  load<TElement extends Primitives.ElementBase>(type: TElement["$Type"], elementId: string): Promise<TElement | null>;
  save<TElement extends Primitives.ElementBase>(element: TElement): Promise<void>;
}

// Renames the entity itself. Runs last, so every updater before it matched on the old qualified name.
export class EntityRenameStep implements FinalStep {
  readonly title = "Rename entity";
  private readonly domainModels: DomainModelAccess;
  private readonly context: RenameContext;

  constructor(domainModels: DomainModelAccess, context: RenameContext) {
    this.domainModels = domainModels;
    this.context = context;
  }

  // Checks against a freshly loaded domain model; returns an error message, or null when the rename can go ahead.
  async validate(): Promise<string | null> {
    const domainModel = await this.loadDomainModel();
    if (domainModel === null) {
      return `Domain model of ${this.context.moduleName} not found.`;
    }
    return findEntityProblem(domainModel, this.context);
  }

  async run(report: RenameReport): Promise<true | string> {
    if (report.hasErrors) {
      report.skipEntity(`${report.failures.length} documents failed to update; fix them and rerun`);
      return true;
    }
    const domainModel = await this.loadDomainModel();
    if (domainModel === null) {
      return `Domain model of ${this.context.moduleName} not found.`;
    }
    const problem = findEntityProblem(domainModel, this.context);
    if (problem !== null) {
      report.skipEntity(problem);
      return problem;
    }
    const entity = domainModel.entities.find((e) => e.$ID === this.context.entityId)!;
    entity.name = this.context.newName;
    await this.domainModels.save(domainModel);
    report.entityRenamed = true;
    console.info(`renamed entity ${this.context.oldQualifiedName} to ${this.context.newName}`);
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

export function findEntityProblem(domainModel: DomainModels.DomainModel, context: RenameContext): string | null {
  if (!domainModel.entities.some((e) => e.$ID === context.entityId)) {
    return `Entity ${context.oldQualifiedName} not found in its domain model.`;
  }
  if (domainModel.entities.some((e) => e.$ID !== context.entityId && e.name === context.newName)) {
    return `An entity named ${context.moduleName}.${context.newName} already exists.`;
  }
  return null;
}
