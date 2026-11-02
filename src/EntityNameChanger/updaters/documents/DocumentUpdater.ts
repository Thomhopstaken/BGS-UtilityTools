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
  // Local renames skipped because the new name is taken.
  readonly skipped?: number;
};

export const NO_LOCAL_RENAMES: LocalRenames = Object.freeze({ renames: new Map<string, string>(), referencedByCallers: false });

// Named elements of the entity (parameters, definitions) whose name holds the entity name. A new name taken by a
// sibling is skipped and counted. owner is used in log lines only.
export function planNamedRenames<T extends { name: string }>(
  owner: string,
  elements: readonly T[],
  ofEntity: (element: T) => boolean,
  naming: NamingPolicy,
  referencedByCallers: boolean,
): LocalRenames {
  const taken = new Set(elements.map((element) => element.name));
  const renames = new Map<string, string>();
  let skipped = 0;
  for (const element of elements) {
    if (!ofEntity(element)) {
      continue;
    }
    const newName = naming.rename(element.name);
    if (newName === element.name) {
      continue;
    }
    if (taken.has(newName)) {
      console.info(`${owner}: skipped renaming '${element.name}': '${newName}' already exists`);
      skipped++;
      continue;
    }
    console.debug(`${owner}: rename '${element.name}' -> '${newName}'`);
    taken.add(newName);
    renames.set(element.name, newName);
  }
  if (renames.size === 0 && skipped === 0) {
    return NO_LOCAL_RENAMES;
  }
  return { renames, referencedByCallers: referencedByCallers && renames.size > 0, skipped };
}

// Renames the named elements listed in local; returns the number renamed.
export function applyNamedRenames(elements: readonly { name: string }[], local: LocalRenames): number {
  let changes = 0;
  for (const element of elements) {
    const newName = local.renames.get(element.name);
    if (newName !== undefined) {
      console.debug(`applying rename '${element.name}' -> '${newName}'`);
      element.name = newName;
      changes++;
    }
  }
  return changes;
}

// The document-type specific part of a DocumentUpdater.
export interface DocumentInspector<TUnit extends Primitives.UnitBase & { name: string }> {
  usesEntity(unit: TUnit, info: Readonly<Primitives.UnitInfo>): boolean;
  planLocalRenames(unit: TUnit): LocalRenames;
  // Applies the local renames and any other in-document change; returns the number of changed values.
  apply(unit: TUnit, local: LocalRenames): number;
  // Exposed names renamed and skipped by the last apply (published services only).
  exposedNameCounts?(): { renamed: number; skipped: number };
  // Whether apply changes more than the local renames; read while planning. Absent: only local renames.
  changesBeyondRenames?(unit: TUnit): boolean;
  // Planning needs only the unit's metadata (name, module), so the planner never loads it.
  readonly plansFromInfo?: boolean;
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

// Documents without flow variables (workflows, mappings, JSON structures, message definitions, document templates,
// datasets, Java and JavaScript actions), in two phases:
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
  // Set when planning needs only metadata; the job then never loads the unit.
  readonly updateFromInfo?: (info: Readonly<Primitives.UnitInfo>) => UnitUpdateResult;

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
    if (spec.mode === "plan" && inspector.plansFromInfo === true) {
      this.updateFromInfo = (info) => {
        console.debug(`plan: checking ${this.kind} ${info.moduleName}.${info.name} from its metadata`);
        // The inspector reads only the name besides the metadata.
        return this.plan({ name: info.name ?? "" } as TUnit, info);
      };
    }
  }

  // Rename phase: only documents the plan found work for are loaded.
  accepts(info: Readonly<Primitives.UnitInfo>): boolean {
    return this.mode === "plan" || this.deps.plan.needsRename(info.$ID);
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
    // Skipped local renames count as work: the rename phase reports them.
    const work = local.renames.size > 0 || (local.skipped ?? 0) > 0 || (this.inspector.changesBeyondRenames?.(doc) ?? false);
    if (work) {
      this.deps.plan.markWork(info.$ID);
    }
    this.recordRenames(info, doc.name, document.renamedTo, local);
    console.info(
      `planned ${this.kind} ${info.moduleName}.${doc.name}: usesEntity=${usesEntity}, renamedTo=${document.renamedTo}, ${local.renames.size} local renames, work=${work}`,
    );
    return { ...UNCHANGED };
  }

  private rename(doc: TUnit, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const oldName = doc.name;
    const local = this.inspector.planLocalRenames(doc);
    const changes = this.inspector.apply(doc, local);
    const exposed = this.inspector.exposedNameCounts?.();
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
      skippedRenames: document.skipped + (local.skipped ?? 0) + (exposed?.skipped ?? 0),
      renamedAssociations: 0,
      ...(exposed === undefined ? {} : { renamedExposedNames: exposed.renamed }),
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
      this.deps.renames.addDocument(moduleName, oldName, renamedTo, info.$ID);
    }
    if (!local.referencedByCallers) {
      return;
    }
    for (const [oldLocal, newLocal] of local.renames) {
      this.deps.renames.addParameter(moduleName, oldName, renamedTo ?? oldName, oldLocal, newLocal, info.$ID);
    }
  }
}
