import type { Primitives } from "@mendix/extensions-api";
import type { DocumentNameRegistry } from "../../framework/DocumentNameRegistry";
import { type DocumentRenamePlan, qualifiedName } from "../../framework/DocumentRenamePlan";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult, type UpdaterMode } from "../../framework/types";
import { planDocumentRename } from "../shared/renameDocument";
import type { PageDocument, PageHelper } from "./PageHelper";

export type PageUpdaterSpec = {
  label: string;
  // Progress step title; defaults to "Updating <label>".
  title?: string;
  unitType: "Pages$Page" | "Pages$Snippet";
  // Used in log lines: "page" or "snippet".
  kind: string;
  description: string;
  mode: UpdaterMode;
};

// Shared state of the plan and rename phases of one job.
export type PageUpdaterDeps = {
  helper: PageHelper;
  documentNames: DocumentNameRegistry;
  renames: QualifiedNameRenames;
  plan: DocumentRenamePlan;
};

// Pages and snippets, in two phases:
// plan   - read-only: decides the document rename and records document and parameter renames.
// rename - renames entity parameters, their usages and the document (as planned); references to other renamed
//          names are left to the reference pass.
export class PageUpdater<TUnit extends PageDocument> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly title?: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description: string;
  readonly access: UnitAccess<TUnit>;
  private readonly kind: string;
  private readonly mode: UpdaterMode;
  private readonly deps: PageUpdaterDeps;

  constructor(spec: PageUpdaterSpec, access: UnitAccess<TUnit>, deps: PageUpdaterDeps) {
    this.label = spec.label;
    this.title = spec.title;
    this.unitType = spec.unitType;
    this.kind = spec.kind;
    this.description = spec.description;
    this.mode = spec.mode;
    this.access = access;
    this.deps = deps;
  }

  async update(doc: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    const helper = this.deps.helper;
    console.debug(`${this.mode}: checking ${this.kind} ${info.moduleName}.${doc.name}`);
    helper.reset();
    helper.detectParameters(doc);
    return this.mode === "plan" ? this.plan(doc, info) : this.rename(doc, info);
  }

  // Changes nothing in the unit; only the registry, the rename map and the plan are filled.
  private plan(doc: TUnit, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const helper = this.deps.helper;
    const document = planDocumentRename(
      this.kind,
      doc.name,
      info,
      helper.naming,
      this.deps.documentNames,
      helper.shouldRenameDocument(doc),
    );
    this.deps.plan.set(info.$ID, document, qualifiedName(info.moduleName, doc.name));
    this.recordRenames(info, doc.name, document.renamedTo);
    console.info(
      `planned ${this.kind} ${info.moduleName}.${doc.name}: renamedTo=${document.renamedTo}, ${helper.renames.size} parameter renames`,
    );
    return { ...UNCHANGED };
  }

  private rename(doc: TUnit, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const helper = this.deps.helper;
    const oldName = doc.name;
    let usages = 0;
    if (helper.renames.size > 0) {
      helper.applyRenames();
      usages = helper.updateUsages(doc);
    } else {
      console.debug(`no parameters to rename in ${oldName}`);
    }
    const document = this.deps.plan.get(info.$ID);
    if (document.renamedTo !== null) {
      console.info(`renaming ${this.kind} ${info.moduleName}.${oldName} to ${document.renamedTo}`);
      doc.name = document.renamedTo;
    }
    const result: UnitUpdateResult = {
      changed: helper.renames.size > 0 || document.renamedTo !== null,
      renamedTo: document.renamedTo,
      renamedVariables: helper.renames.size,
      updatedReferences: 0,
      skippedRenames: helper.skippedRenames + document.skipped,
      renamedAssociations: 0,
    };
    console.info(
      `${info.moduleName}.${oldName}: changed=${result.changed}, ${result.renamedVariables} renames, ${usages} usages, ${result.skippedRenames} skipped`,
    );
    return result;
  }

  // Callers reference the document and its parameters by qualified name; the reference pass rewrites them.
  private recordRenames(info: Readonly<Primitives.UnitInfo>, oldName: string, renamedTo: string | null): void {
    const moduleName = info.moduleName;
    if (moduleName === undefined) {
      return;
    }
    if (renamedTo !== null) {
      this.deps.renames.addDocument(moduleName, oldName, renamedTo);
    }
    for (const [oldParameter, newParameter] of this.deps.helper.renames) {
      this.deps.renames.addParameter(moduleName, oldName, renamedTo ?? oldName, oldParameter, newParameter);
    }
  }
}
