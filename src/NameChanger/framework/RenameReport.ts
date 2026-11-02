import { JobReport } from "../../shared/rename/JobReport";
import { MessageDefinitionUsage } from "./MessageDefinitionUsage";

// A changed message definition no longer matches the mappings that use it; they must be updated by hand.
export const MESSAGE_DEFINITION_UNIT_TYPES: ReadonlySet<string> = new Set([
  "MessageDefinitions$MessageDefinitionCollection",
  "MessageDefinitions$MessageDefinition2",
]);

export type MappedMessageDefinition = {
  unitId: string;
  // Before the rename.
  qualifiedName: string;
  mappings: string[];
};

// The job report plus what only an entity rename has: the entity itself and message definition usage.
export class RenameReport extends JobReport {
  entityRenamed = false;
  entitySkipReason: string | null = null;
  // Filled by the mapping planners.
  readonly messageDefinitionUsage = new MessageDefinitionUsage();

  skipEntity(reason: string): void {
    console.info(`entity rename skipped: ${reason}`);
    this.entitySkipReason = reason;
  }

  // One line per kind of change, then the failures and why the entity was not renamed or the job not finished.
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

  // Changed message definitions that import or export mappings use, each once with its mappings.
  changedMappedMessageDefinitions(): MappedMessageDefinition[] {
    const byUnit = new Map<string, MappedMessageDefinition>();
    for (const outcome of this.changed) {
      if (!MESSAGE_DEFINITION_UNIT_TYPES.has(outcome.unitType) || byUnit.has(outcome.unitId)) {
        continue;
      }
      const mappings = this.messageDefinitionUsage.mappingsOf(outcome.qualifiedName);
      if (mappings.length > 0) {
        byUnit.set(outcome.unitId, { unitId: outcome.unitId, qualifiedName: outcome.qualifiedName, mappings });
      }
    }
    console.debug(`changed message definitions used by mappings: ${byUnit.size}`);
    return [...byUnit.values()];
  }
}
