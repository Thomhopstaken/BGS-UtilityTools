import type { Primitives } from "@mendix/extensions-api";
import type { QualifiedNameRenames } from "./QualifiedNameRenames";
import type { ReferenceIndex } from "./ReferenceIndex";
import { findReferencedNameInUnit, rewriteQualifiedNamesInUnit } from "./rewrite/qualifiedNameRewrite";

// What a rename save needs to also rewrite references to names that exist already.
export type ExistingReferences = {
  // Whether a unit was saved in this job.
  readonly isSaved: (unitId: string) => boolean;
  // Marks the unit up to date, so the reference pass skips it.
  readonly index: ReferenceIndex;
};

// In a unit's rename save, rewrites the references to renamed names that exist already. A name whose declaring unit
// is saved later keeps its old name, which still exists then, and the reference pass rewrites it. New names are never
// rename keys, so the reference pass can't rewrite twice. Returns the number of rewritten values.
// UNVERIFIED: Studio Pro shows no stale error for a unit whose last save is in the rename phase.
export function rewriteExistingReferences(
  unit: Primitives.UnitBase,
  info: Readonly<Primitives.UnitInfo>,
  renames: QualifiedNameRenames,
  references: ExistingReferences,
  onlyProperties?: ReadonlySet<string>,
): number {
  const count = rewriteQualifiedNamesInUnit(unit, renames.existing(references.isSaved), onlyProperties);
  const pending = findReferencedNameInUnit(unit, renames.map, onlyProperties);
  if (pending === null) {
    references.index.markUpToDate(info.$ID);
  }
  const name = (unit as { name?: unknown }).name;
  console.info(
    `${info.moduleName}.${typeof name === "string" ? name : info.name}: ${count} references updated, ${pending === null ? "up to date" : `${pending} left to the reference pass`}`,
  );
  return count;
}
