import type { Primitives } from "@mendix/extensions-api";
import type { UnitUpdateResult } from "./types";

export type UnitOutcome = {
  label: string;
  unitId: string;
  name: string;
  // Module.Name, or the name alone for a unit outside a module.
  qualifiedName: string;
  result: UnitUpdateResult;
};

export type UnitFailure = {
  label: string;
  unitId: string;
  name: string;
  error: string;
};

export type DocumentRenameOutcome = {
  unitType: string;
  oldQualifiedName: string;
  newQualifiedName: string;
};

// Document types navigation can reference (menu items, home pages, login page).
// Navigation is not in the extensions API, so these are reported for a manual check.
export const NAVIGATION_UNIT_TYPES: ReadonlySet<string> = new Set(["Pages$Page", "Microflows$Microflow", "Microflows$Nanoflow"]);

// Collects what happened per unit during a job.
export class RenameReport {
  readonly changed: UnitOutcome[] = [];
  readonly failures: UnitFailure[] = [];
  readonly renamedDocuments: DocumentRenameOutcome[] = [];
  // Unit ids; a unit is visited by a rename and a reference updater, so it is counted once.
  private readonly checkedIds = new Set<string>();
  private readonly changedIds = new Set<string>();
  skippedRenames = 0;
  updatedReferences = 0;
  renamedAssociations = 0;
  entityRenamed = false;
  entitySkipReason: string | null = null;
  // Set when the job stopped after the entity was renamed.
  incompleteReason: string | null = null;

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
      const qualifiedName = info.moduleName === undefined ? name : `${info.moduleName}.${name}`;
      this.changed.push({ label, unitId: info.$ID, name, qualifiedName, result });
    }
    if (result.renamedTo !== null && info.name !== undefined) {
      const module = info.moduleName === undefined ? "" : `${info.moduleName}.`;
      this.renamedDocuments.push({
        unitType: info.$Type,
        oldQualifiedName: `${module}${info.name}`,
        newQualifiedName: `${module}${result.renamedTo}`,
      });
    }
  }

  addError(label: string, info: Readonly<Primitives.UnitInfo>, error: unknown): void {
    this.checkedIds.add(info.$ID);
    const message = error instanceof Error ? error.message : String(error);
    console.info(`${label} ${info.moduleName}.${info.name} failed: ${message}`);
    this.failures.push({ label, unitId: info.$ID, name: `${info.moduleName}.${info.name}`, error: message });
  }

  skipEntity(reason: string): void {
    console.info(`entity rename skipped: ${reason}`);
    this.entitySkipReason = reason;
  }

  markIncomplete(reason: string): void {
    console.info(`rename incomplete: ${reason}`);
    this.incompleteReason = reason;
  }

  summary(): string[] {
    const lines = [`Checked ${this.checkedUnits} documents, updated ${this.changedUnits}.`];
    const renamedDocuments = this.changed.filter((c) => c.result.renamedTo !== null);
    if (renamedDocuments.length > 0) {
      lines.push(`Renamed ${renamedDocuments.length} documents.`);
    }
    if (this.renamedAssociations > 0) {
      lines.push(`Renamed ${this.renamedAssociations} associations.`);
    }
    if (this.updatedReferences > 0) {
      lines.push(`Updated ${this.updatedReferences} references to the renamed entity, documents, parameters and associations.`);
    }
    if (this.skippedRenames > 0) {
      lines.push(`Skipped ${this.skippedRenames} renames because the new name is already in use (see the log).`);
    }
    for (const failure of this.failures) {
      lines.push(`Failed: ${failure.label} ${failure.name}: ${failure.error}`);
    }
    if (this.entitySkipReason !== null) {
      lines.push(`Entity not renamed: ${this.entitySkipReason}`);
    }
    if (this.incompleteReason !== null) {
      lines.push(`Not finished: ${this.incompleteReason}`);
    }
    return lines;
  }

  // Renamed documents navigation may reference; these need a manual check.
  navigationDocuments(): DocumentRenameOutcome[] {
    return this.renamedDocuments.filter((d) => NAVIGATION_UNIT_TYPES.has(d.unitType));
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
