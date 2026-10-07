import type { Microflows, Primitives } from "@mendix/extensions-api";
import type { DocumentNameRegistry } from "../../framework/DocumentNameRegistry";
import type { DocumentRenamePlan } from "../../framework/DocumentRenamePlan";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult, type UpdaterMode } from "../../framework/types";
import { planDocumentRename } from "../shared/renameDocument";
import type { MicroflowHelper } from "./MicroflowHelper";
import type { ReferenceResolver } from "./ReferenceResolver";

export type FlowUpdaterSpec = {
  label: string;
  // Progress step title; defaults to "Updating <label>".
  title?: string;
  unitType: "Microflows$Microflow" | "Microflows$Nanoflow";
  // Used in log lines: "microflow" or "nanoflow".
  kind: string;
  description: string;
  mode: UpdaterMode;
};

// Shared state of the plan and rename phases of one job.
export type FlowUpdaterDeps = {
  helper: MicroflowHelper;
  resolver: ReferenceResolver;
  documentNames: DocumentNameRegistry;
  renames: QualifiedNameRenames;
  plan: DocumentRenamePlan;
};

export type FlowDocument = Microflows.Microflow | Microflows.Nanoflow;

// Microflows and nanoflows, in two phases:
// plan   - read-only: resolves references, decides the document rename and records document and parameter renames.
// rename - renames variables, parameters, the return variable and the flow (as planned). Uses the references
//          resolved in the plan phase; references to other renamed names are left to the reference pass.
export class FlowUpdater<TUnit extends FlowDocument> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly title?: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description: string;
  readonly access: UnitAccess<TUnit>;
  private readonly kind: string;
  private readonly mode: UpdaterMode;
  private readonly deps: FlowUpdaterDeps;

  constructor(spec: FlowUpdaterSpec, access: UnitAccess<TUnit>, deps: FlowUpdaterDeps) {
    this.label = spec.label;
    this.title = spec.title;
    this.unitType = spec.unitType;
    this.kind = spec.kind;
    this.description = spec.description;
    this.mode = spec.mode;
    this.access = access;
    this.deps = deps;
  }

  async update(flow: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    const helper = this.deps.helper;
    console.log(`${this.mode}: checking ${this.kind} ${info.moduleName}.${flow.name}`);
    helper.reset();
    // Only planning resolves; resolve() while units are being changed may leave loaded copies stale.
    if (this.mode === "plan") {
      await this.deps.resolver.resolveAll(helper.collectReferences(flow.objectCollection.objects));
    }
    helper.detectEntityVariables(flow);
    return this.mode === "plan" ? this.plan(flow, info) : this.rename(flow, info);
  }

  // Changes nothing in the unit; only the registry, the rename map and the plan are filled.
  private plan(flow: TUnit, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const helper = this.deps.helper;
    const document = planDocumentRename(
      this.kind,
      flow.name,
      info,
      helper.naming,
      this.deps.documentNames,
      helper.shouldRenameDocument(flow),
    );
    this.deps.plan.set(info.$ID, document);
    this.recordRenames(info, flow.name, document.renamedTo);
    console.info(
      `planned ${this.kind} ${info.moduleName}.${flow.name}: renamedTo=${document.renamedTo}, ${helper.parameterRenames().length} parameter renames`,
    );
    return { ...UNCHANGED };
  }

  private rename(flow: TUnit, info: Readonly<Primitives.UnitInfo>): UnitUpdateResult {
    const helper = this.deps.helper;
    const oldName = flow.name;
    if (helper.renames.length > 0) {
      helper.applyRenames();
      helper.updateObjectUsages(flow.objectCollection.objects);
    } else {
      console.debug(`no variables to rename in ${oldName}`);
    }
    const returnVariableChanged = helper.updateReturnVariableName(flow);
    const document = this.deps.plan.get(info.$ID);
    if (document.renamedTo !== null) {
      console.info(`renaming ${this.kind} ${info.moduleName}.${oldName} to ${document.renamedTo}`);
      flow.name = document.renamedTo;
    }
    const result: UnitUpdateResult = {
      changed: helper.renames.length > 0 || returnVariableChanged || document.renamedTo !== null,
      renamedTo: document.renamedTo,
      renamedVariables: helper.renames.length,
      updatedReferences: 0,
      skippedRenames: helper.skippedRenames + document.skipped,
    };
    console.info(
      `${info.moduleName}.${oldName}: changed=${result.changed}, ${result.renamedVariables} renames, ${result.skippedRenames} skipped`,
    );
    return result;
  }

  // Callers reference the flow and its parameters by qualified name; the reference pass rewrites them.
  private recordRenames(info: Readonly<Primitives.UnitInfo>, oldName: string, renamedTo: string | null): void {
    const moduleName = info.moduleName;
    if (moduleName === undefined) {
      return;
    }
    if (renamedTo !== null) {
      this.deps.renames.addDocument(moduleName, oldName, renamedTo);
    }
    for (const parameter of this.deps.helper.parameterRenames()) {
      this.deps.renames.addParameter(moduleName, oldName, renamedTo ?? oldName, parameter.oldName, parameter.newName);
    }
  }
}
