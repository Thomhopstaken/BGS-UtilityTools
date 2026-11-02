import type { Primitives } from "@mendix/extensions-api";
import type { DocumentNameRegistry } from "../../framework/DocumentNameRegistry";
import { type DocumentRenamePlan, qualifiedName } from "../../framework/DocumentRenamePlan";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult, type UpdaterMode } from "../../framework/types";
import { planDocumentRename } from "../shared/renameDocument";

// Names inside one document that are renamed with it, old -> new.
export type LocalRenames = {
  readonly renames: ReadonlyMap<string, string>;
  // Callers reference these as Module.Document.Name, so they are recorded for the reference pass.
  readonly referencedByCallers: boolean;
};

export const NO_LOCAL_RENAMES: LocalRenames = Object.freeze({ renames: new Map<string, string>(), referencedByCallers: false });

// The document-type specific part of a DocumentUpdater.
export interface DocumentInspector<TUnit extends Primitives.UnitBase & { name: string }> {
  usesEntity(unit: TUnit, info: Readonly<Primitives.UnitInfo>): boolean;
  planLocalRenames(unit: TUnit): LocalRenames;
  // Applies the local renames and any other in-document change; returns the number of changed values.
  apply(unit: TUnit, local: LocalRenames): number;
}

export type DocumentUpdaterSpec = {
  label: string;
  // Progress step title; defaults to "Updating <label>".
  title?: string;
  unitType: string;
  // Used in log lines: "workflow", "import mapping", ...
  kind: string;
  description: string;
  mode: UpdaterMode;
};

// Shared state of the plan and rename phases of one job.
export type DocumentUpdaterDeps = {
  naming: NamingPolicy;
  documentNames: DocumentNameRegistry;
  renames: QualifiedNameRenames;
  plan: DocumentRenamePlan;
};

// Documents without flow variables (workflows, mappings, JSON structures), in two phases:
// plan   - read-only: decides the document rename and records it, with caller-visible local renames.
// rename - applies the local renames and the planned document rename; references are left to the reference pass.
export class DocumentUpdater<TUnit extends Primitives.UnitBase & { name: string }> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly title?: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description: string;
  readonly access: UnitAccess<TUnit>;
  private readonly kind: string;
  private readonly mode: UpdaterMode;
  private readonly inspector: DocumentInspector<TUnit>;
  private readonly deps: DocumentUpdaterDeps;

  constructor(spec: DocumentUpdaterSpec, access: UnitAccess<TUnit>, inspector: DocumentInspector<TUnit>, deps: DocumentUpdaterDeps) {
    this.label = spec.label;
    this.title = spec.title;
    this.unitType = spec.unitType;
    this.kind = spec.kind;
    this.description = spec.description;
    this.mode = spec.mode;
    this.access = access;
    this.inspector = inspector;
    this.deps = deps;
  }

  async update(doc: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    console.debug(`${this.mode}: checking ${this.kind} ${info.moduleName}.${doc.name}`);
    return this.mode === "plan" ? this.plan(doc, info) : this.rename(doc, info);
  }

  // Changes nothing in the unit; only the registry, the rename map and the plan are filled.
  private plan(doc: TUnit, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const usesEntity = this.inspector.usesEntity(doc, info);
    const document = planDocumentRename(
      this.kind,
      doc.name,
      info,
      this.deps.naming,
      this.deps.documentNames,
      usesEntity && this.deps.naming.contains(doc.name),
    );
    this.deps.plan.set(info.$ID, document, qualifiedName(info.moduleName, doc.name));
    const local = this.inspector.planLocalRenames(doc);
    this.recordRenames(info, doc.name, document.renamedTo, local);
    console.info(
      `planned ${this.kind} ${info.moduleName}.${doc.name}: usesEntity=${usesEntity}, renamedTo=${document.renamedTo}, ${local.renames.size} local renames`,
    );
    return { ...UNCHANGED };
  }

  private rename(doc: TUnit, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const oldName = doc.name;
    const local = this.inspector.planLocalRenames(doc);
    const changes = this.inspector.apply(doc, local);
    const document = this.deps.plan.get(info.$ID);
    if (document.renamedTo !== null) {
      console.info(`renaming ${this.kind} ${info.moduleName}.${oldName} to ${document.renamedTo}`);
      doc.name = document.renamedTo;
    }
    const result: UnitUpdateResult = {
      changed: changes > 0 || document.renamedTo !== null,
      renamedTo: document.renamedTo,
      renamedVariables: local.renames.size,
      updatedReferences: 0,
      skippedRenames: document.skipped,
      renamedAssociations: 0,
    };
    console.info(
      `${info.moduleName}.${oldName}: changed=${result.changed}, ${result.renamedVariables} local renames, ${changes} changes, ${result.skippedRenames} skipped`,
    );
    return result;
  }

  private recordRenames(info: Readonly<Primitives.UnitInfo>, oldName: string, renamedTo: string | null, local: LocalRenames): void {
    const moduleName = info.moduleName;
    if (moduleName === undefined) {
      return;
    }
    if (renamedTo !== null) {
      this.deps.renames.addDocument(moduleName, oldName, renamedTo);
    }
    if (!local.referencedByCallers) {
      return;
    }
    for (const [oldLocal, newLocal] of local.renames) {
      this.deps.renames.addParameter(moduleName, oldName, renamedTo ?? oldName, oldLocal, newLocal);
    }
  }
}
