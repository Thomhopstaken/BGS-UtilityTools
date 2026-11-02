import type { Microflows, Primitives } from "@mendix/extensions-api";
import type { DocumentNameRegistry } from "../../../shared/rename/DocumentNameRegistry";
import { type DocumentRenamePlan, qualifiedName } from "../../framework/DocumentRenamePlan";
import type { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { type ExistingReferences, rewriteExistingReferences } from "../../../shared/rename/existingReferences";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult, type UpdaterMode } from "../../../shared/rename/types";
import { planDocumentRename } from "../shared/renameDocument";
import type { MicroflowHelper } from "./MicroflowHelper";
import type { ReferenceResolver } from "./ReferenceResolver";

// Settings for one flow type in one phase.
export type FlowUpdaterSpec = {
  label: string;
  // Progress step title; defaults to "Updating <label>".
  title?: string;
  unitType: FlowUnitType;
  // Used in log lines: "microflow", "nanoflow" or "rule".
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
  // Rename phase: references to names that exist already are rewritten in the same save. Without it all references
  // are left to the reference pass.
  references?: ExistingReferences;
};

export type FlowUnitType = "Microflows$Microflow" | "Microflows$Nanoflow" | "Microflows$Rule";

export type FlowDocument = Microflows.Microflow | Microflows.Nanoflow | Microflows.Rule;

// Microflows, nanoflows and rules, in two phases:
// plan   - read-only: resolves references, decides the document rename and records document and parameter renames.
// rename - renames variables, parameters, the return variable and the flow (as planned). Uses the references
//          resolved in the plan phase. References to renamed names that exist already (their declaring unit was
//          saved) are rewritten in the same save; the rest is left to the reference pass.
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

  // Rename phase: only flows the plan found work for are loaded.
  accepts(info: Readonly<Primitives.UnitInfo>): boolean {
    return this.mode === "plan" || this.deps.plan.needsRename(info.$ID);
  }

  async update(flow: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    const helper = this.deps.helper;
    console.debug(`${this.mode}: checking ${this.kind} ${info.moduleName}.${flow.name}`);
    helper.reset();
    // Only planning resolves; resolve() while units are being changed may leave loaded copies stale.
    if (this.mode === "plan") {
      await this.deps.resolver.resolveAll(helper.collectReferences(flow.objectCollection.objects));
    }
    helper.detectEntityVariables(flow);
    if (flow.$Type === "Microflows$Rule") {
      this.logRuleParameters(flow);
    }
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
    this.deps.plan.set(info.$ID, document, qualifiedName(info.moduleName, flow.name));
    // Skipped renames count as work: the rename phase reports them.
    const work = helper.renames.length > 0 || helper.skippedRenames > 0 || helper.wouldRenameReturnVariable(flow);
    if (work) {
      this.deps.plan.markWork(info.$ID);
    }
    this.recordRenames(info, flow.name, document.renamedTo);
    console.info(
      `planned ${this.kind} ${info.moduleName}.${flow.name}: renamedTo=${document.renamedTo}, ${helper.renames.length} variable renames, ${helper.parameterRenames().length} parameter renames, work=${work}`,
    );
    return { ...UNCHANGED };
  }

  // Applies the plan: variables and their usages, the return variable, the document name, then existing references.
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
    const references = this.rewriteExistingReferences(flow, info);
    const result: UnitUpdateResult = {
      changed: helper.renames.length > 0 || returnVariableChanged || document.renamedTo !== null || references > 0,
      renamedTo: document.renamedTo,
      renamedVariables: helper.renames.length,
      updatedReferences: references,
      skippedRenames: helper.skippedRenames + document.skipped,
      renamedAssociations: 0,
    };
    console.info(
      `${info.moduleName}.${oldName}: changed=${result.changed}, ${result.renamedVariables} renames, ${result.skippedRenames} skipped`,
    );
    return result;
  }

  // Saves the flow's reference pass when every renamed name it references exists already; a callee saved later (later
  // in this step, pages, other documents) is left to the reference pass.
  private rewriteExistingReferences(flow: TUnit, info: Readonly<Primitives.UnitInfo>): number {
    const references = this.deps.references;
    return references === undefined ? 0 : rewriteExistingReferences(flow, info, this.deps.renames, references);
  }

  // UNVERIFIED: rule parameters are assumed to appear as parameter objects too, as in microflows.
  // Studio Pro left rule.parameters undefined despite the typings.
  private logRuleParameters(rule: Microflows.Rule): void {
    const objects = rule.objectCollection.objects.filter((o) => o.$Type === "Microflows$MicroflowParameterObject").length;
    const listed = rule.parameters?.length;
    console.debug(`rule ${rule.name}: ${listed ?? "no"} listed parameters, ${objects} parameter objects`);
    if (listed !== undefined && objects < listed) {
      console.info(`rule ${rule.name}: parameters without a parameter object are not renamed`);
    }
  }

  // Callers reference the flow and its parameters by qualified name; the reference pass rewrites them.
  private recordRenames(info: Readonly<Primitives.UnitInfo>, oldName: string, renamedTo: string | null): void {
    const moduleName = info.moduleName;
    if (moduleName === undefined) {
      return;
    }
    if (renamedTo !== null) {
      this.deps.renames.addDocument(moduleName, oldName, renamedTo, info.$ID);
    }
    for (const parameter of this.deps.helper.parameterRenames()) {
      this.deps.renames.addParameter(moduleName, oldName, renamedTo ?? oldName, parameter.oldName, parameter.newName, info.$ID);
    }
  }
}
