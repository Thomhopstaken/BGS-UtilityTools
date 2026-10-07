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
  checkedUnits = 0;
  skippedRenames = 0;
  entityRenamed = false;
  entitySkipReason: string | null = null;

  get hasErrors(): boolean {
    return this.failures.length > 0;
  }

  addResult(label: string, info: Readonly<Primitives.UnitInfo>, result: UnitUpdateResult): void {
    this.checkedUnits++;
    this.skippedRenames += result.skippedRenames;
    if (result.changed) {
      this.changed.push({ label, unitId: info.$ID, name: info.name ?? info.$ID, result });
    }
  }

  addError(label: string, info: Readonly<Primitives.UnitInfo>, error: unknown): void {
    this.checkedUnits++;
    const message = error instanceof Error ? error.message : String(error);
    console.info(`${label} ${info.moduleName}.${info.name} failed: ${message}`);
    this.failures.push({ label, unitId: info.$ID, name: `${info.moduleName}.${info.name}`, error: message });
  }

  skipEntity(reason: string): void {
    console.info(`entity rename skipped: ${reason}`);
    this.entitySkipReason = reason;
  }

  summary(): string[] {
    const lines = [`Checked ${this.checkedUnits} documents, updated ${this.changed.length}.`];
    const renamedDocuments = this.changed.filter((c) => c.result.renamedTo !== null);
    if (renamedDocuments.length > 0) {
      lines.push(`Renamed ${renamedDocuments.length} documents.`);
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
    return lines;
  }
}
