import type { Primitives } from "@mendix/extensions-api";
import type { UnitUpdateResult } from "./types";

export type UnitOutcome = {
  label: string;
  unitId: string;
  name: string;
  result: UnitUpdateResult;
};

export type UnitFailure = {
  label: string;
  unitId: string;
  name: string;
  error: string;
};

// Collects what happened per unit during a job.
export class RenameReport {
  readonly changed: UnitOutcome[] = [];
  readonly failures: UnitFailure[] = [];
  // Unit ids; a unit is visited by a rename and a reference updater, so it is counted once.
  private readonly checkedIds = new Set<string>();
  private readonly changedIds = new Set<string>();
  skippedRenames = 0;
  updatedReferences = 0;
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
    if (result.changed) {
      this.changedIds.add(info.$ID);
      this.changed.push({ label, unitId: info.$ID, name: info.name ?? info.$ID, result });
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
    if (this.updatedReferences > 0) {
      lines.push(`Updated ${this.updatedReferences} references to the renamed entity, documents and parameters.`);
    }
    if (this.skippedRenames > 0) {
      lines.push(`Skipped ${this.skippedRenames} renames because the new name is already in use.`);
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
}
