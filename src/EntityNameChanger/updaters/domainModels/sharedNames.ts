import type { DocumentNameRegistry } from "../../framework/DocumentNameRegistry";
import type { DocumentRenamePlan } from "../../framework/DocumentRenamePlan";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";

export type SharedNameInput = {
  moduleName: string;
  // Old name of the association, also the name of a document in the same module.
  name: string;
  // The association's own planned name; null when it would keep its name.
  associationTarget: string | null;
  associationNameFree: (name: string) => boolean;
  documentNames: DocumentNameRegistry;
  documentPlan: DocumentRenamePlan;
  renames: QualifiedNameRenames;
};

export type SharedNameOutcome = {
  // New association name; null when the association keeps its name.
  associationTarget: string | null;
  skipped: number;
};

// A document and an association share one key in the rename map, so both get the same new name or neither is
// renamed. Adds or revokes the document rename in the plan, registry and rename map; planning only, no writes.
export function reconcileSharedName(input: SharedNameInput): SharedNameOutcome {
  const { moduleName, name, associationTarget, documentNames, documentPlan } = input;
  const qname = `${moduleName}.${name}`;
  const unitId = documentPlan.unitIdOf(qname);
  const documentTarget = unitId === undefined ? null : documentPlan.get(unitId).renamedTo;
  const target = associationTarget ?? documentTarget;
  console.debug(`shared name ${qname}: association -> ${associationTarget}, document -> ${documentTarget}`);
  if (target === null) {
    return { associationTarget: null, skipped: 0 };
  }
  const documentOk =
    documentTarget === target || (documentTarget === null && unitId !== undefined && documentNames.isFree(moduleName, target));
  const associationOk = input.associationNameFree(target);
  if (documentOk && associationOk) {
    if (documentTarget === null) {
      forceDocumentRename(input, unitId!, target);
    }
    console.info(`shared name ${qname}: document and association both renamed to ${target}`);
    return { associationTarget: target, skipped: 0 };
  }
  const reason = !associationOk
    ? `association name ${target} is taken`
    : unitId === undefined
      ? "the document is a type that is not renamed"
      : `document name ${target} is taken`;
  if (documentTarget !== null && unitId !== undefined) {
    revokeDocumentRename(input, unitId, documentTarget);
  }
  console.info(`skipped renaming ${qname} (document and association): ${reason}`);
  return { associationTarget: null, skipped: 1 };
}

function forceDocumentRename(input: SharedNameInput, unitId: string, target: string): void {
  const { moduleName, name } = input;
  input.documentNames.register(moduleName, name, target);
  input.documentPlan.set(unitId, { renamedTo: target, skipped: 0 }, `${moduleName}.${name}`);
  input.renames.addDocument(moduleName, name, target);
  input.renames.retargetDocument(moduleName, name, name, target);
  console.info(`document ${moduleName}.${name} renamed to ${target} along with the association`);
}

function revokeDocumentRename(input: SharedNameInput, unitId: string, target: string): void {
  const { moduleName, name } = input;
  input.documentNames.register(moduleName, target, name);
  input.documentPlan.set(unitId, { renamedTo: null, skipped: 1 }, `${moduleName}.${name}`);
  input.renames.remove(`${moduleName}.${name}`);
  input.renames.retargetDocument(moduleName, name, target, name);
  console.info(`document rename ${moduleName}.${name} -> ${target} revoked`);
}
