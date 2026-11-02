import type { Primitives } from "@mendix/extensions-api";
import { JobTimings } from "./JobTimings";
import type { UnitUpdateResult } from "./types";

// A unit an updater changed.
export type UnitOutcome = {
  label: string;
  unitId: string;
  unitType: string;
  name: string;
  // Module.Name, or the name alone for a unit outside a module.
  qualifiedName: string;
  result: UnitUpdateResult;
};

// A unit whose update or save threw.
export type UnitFailure = {
  label: string;
  unitId: string;
  name: string;
  error: string;
};

// A renamed document, by qualified name before and after.
export type DocumentRenameOutcome = {
  unitId: string;
  unitType: string;
  oldQualifiedName: string;
  newQualifiedName: string;
};

// A document a job left as it was on purpose, with the reason.
export type SkippedDocument = {
  unitId: string;
  unitType: string;
  qualifiedName: string;
  // The name it would have had; null when no new name was decided.
  newQualifiedName: string | null;
  reason: string;
};

// Document types navigation can reference (menu items, home pages, login page).
// Navigation is not in the extensions API, so these are reported for a manual check.
export const NAVIGATION_UNIT_TYPES: ReadonlySet<string> = new Set(["Pages$Page", "Microflows$Microflow", "Microflows$Nanoflow"]);

// Actions whose code (javasource, javascriptsource) is not updated; any change needs a manual check.
export const CODE_ACTION_UNIT_TYPES: ReadonlySet<string> = new Set(["JavaActions$JavaAction", "JavaScriptActions$JavaScriptAction"]);

// Datasets are used by report widgets, which are not in the API; a rename needs a manual check.
export const DATA_SET_UNIT_TYPE = "DataSets$DataSet";

// Module.Name, or the name alone for a unit outside a module; the $ID when it has no name.
function qualify(info: Readonly<Primitives.UnitInfo>, name: string = info.name ?? info.$ID): string {
  return info.moduleName === undefined ? name : `${info.moduleName}.${name}`;
}

// Collects what happened per unit during a job; tools extend it with their own results.
export class JobReport {
  readonly changed: UnitOutcome[] = [];
  readonly failures: UnitFailure[] = [];
  readonly renamedDocuments: DocumentRenameOutcome[] = [];
  readonly skippedDocuments: SkippedDocument[] = [];
  // Unit ids; a unit is visited by a rename and a reference updater, so it is counted once.
  private readonly checkedIds = new Set<string>();
  private readonly changedIds = new Set<string>();
  skippedRenames = 0;
  updatedReferences = 0;
  renamedAssociations = 0;
  // Set when the job stopped after something was changed.
  incompleteReason: string | null = null;
  // Document templates in the app's own modules; they are never updated. null: they could not be listed.
  documentTemplates: number | null = 0;
  // Filled by the job and the instrumented model.
  readonly timings = new JobTimings();

  get checkedUnits(): number {
    return this.checkedIds.size;
  }

  get changedUnits(): number {
    return this.changedIds.size;
  }

  wasChanged(unitId: string): boolean {
    return this.changedIds.has(unitId);
  }

  get hasErrors(): boolean {
    return this.failures.length > 0;
  }

  addResult(label: string, info: Readonly<Primitives.UnitInfo>, result: UnitUpdateResult): void {
    this.checkedIds.add(info.$ID);
    this.skippedRenames += result.skippedRenames;
    this.updatedReferences += result.updatedReferences;
    this.renamedAssociations += result.renamedAssociations;
    if (result.changed) {
      this.changedIds.add(info.$ID);
      const name = info.name ?? info.$ID;
      this.changed.push({ label, unitId: info.$ID, unitType: info.$Type, name, qualifiedName: qualify(info), result });
    }
    if (result.renamedTo !== null && info.name !== undefined) {
      this.renamedDocuments.push({
        unitId: info.$ID,
        unitType: info.$Type,
        oldQualifiedName: qualify(info),
        newQualifiedName: qualify(info, result.renamedTo),
      });
    }
  }

  addError(label: string, info: Readonly<Primitives.UnitInfo>, error: unknown): void {
    this.checkedIds.add(info.$ID);
    const message = error instanceof Error ? error.message : String(error);
    console.info(`${label} ${info.moduleName}.${info.name} failed: ${message}`);
    this.failures.push({ label, unitId: info.$ID, name: `${info.moduleName}.${info.name}`, error: message });
  }

  // newName: the name the document would have had.
  skipDocument(info: Readonly<Primitives.UnitInfo>, reason: string, newName?: string): void {
    const skipped: SkippedDocument = {
      unitId: info.$ID,
      unitType: info.$Type,
      qualifiedName: qualify(info),
      newQualifiedName: newName === undefined ? null : qualify(info, newName),
      reason,
    };
    console.info(`skipped ${skipped.qualifiedName}: ${reason}`);
    this.skippedDocuments.push(skipped);
  }

  markIncomplete(reason: string): void {
    console.info(`rename incomplete: ${reason}`);
    this.incompleteReason = reason;
  }

  // Renamed documents navigation may reference; these need a manual check.
  navigationDocuments(): DocumentRenameOutcome[] {
    return this.renamedDocuments.filter((d) => NAVIGATION_UNIT_TYPES.has(d.unitType));
  }

  // Renamed documents of these types.
  renamedOfTypes(unitTypes: ReadonlySet<string>): DocumentRenameOutcome[] {
    return this.renamedDocuments.filter((d) => unitTypes.has(d.unitType));
  }

  // Qualified names (before the rename) of changed Java and JavaScript actions, each once.
  changedCodeActions(): string[] {
    const names = new Set(this.changed.filter((c) => CODE_ACTION_UNIT_TYPES.has(c.unitType)).map((c) => c.qualifiedName));
    console.debug(`code actions to check: ${names.size}`);
    return [...names];
  }

  // Qualified names of published services whose exposed names were renamed; their API clients need a check.
  changedApis(): string[] {
    const names = new Set(this.changed.filter((c) => (c.result.renamedExposedNames ?? 0) > 0).map((c) => c.qualifiedName));
    console.debug(`published services with renamed exposed names: ${names.size}`);
    return [...names];
  }

  // Renamed datasets; report widgets using them need a manual check.
  renamedDataSets(): DocumentRenameOutcome[] {
    return this.renamedDocuments.filter((d) => d.unitType === DATA_SET_UNIT_TYPE);
  }

  // Manual-check lines for renamed documents navigation may reference; empty when none were renamed.
  navigationWarnings(): string[] {
    const renamed = this.navigationDocuments();
    if (renamed.length === 0) {
      console.debug("navigation warning: no renamed pages, microflows or nanoflows");
      return [];
    }
    console.info(`navigation warning: ${renamed.length} renamed documents to check manually`);
    return [
      "Navigation can't be updated by this extension. Check App > Navigation (menu items, home pages, role-based home pages, login page) for these renamed documents:",
      ...renamed.map((d) => `${d.oldQualifiedName} -> ${d.newQualifiedName}`),
    ];
  }
}
