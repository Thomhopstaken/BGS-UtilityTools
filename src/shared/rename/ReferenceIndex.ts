import { qualifiedNamePrefixes } from "./rewrite/qualifiedNameRewrite";
import type { QualifiedNameRenames } from "./QualifiedNameRenames";

// The Module.Name prefixes each unit loaded in the plan phase references, so the reference pass loads only units that
// can hold a renamed name. Units that were not indexed (types the plan phase doesn't load) are always loaded.
export class ReferenceIndex {
  private readonly unitsByPrefix = new Map<string, Set<string>>();
  private readonly indexed = new Set<string>();
  // Units already saved with every renamed name they reference; the reference pass skips them.
  private readonly upToDate = new Set<string>();
  // Units referencing a renamed prefix, with the prefix set they were computed from.
  private affected: { prefixes: ReadonlySet<string>; units: ReadonlySet<string> } | null = null;

  get size(): number {
    return this.indexed.size;
  }

  // Called with the unit as loaded in the plan phase, before anything is renamed.
  add(unitId: string, root: object): void {
    const prefixes = qualifiedNamePrefixes(root);
    for (const prefix of prefixes) {
      let units = this.unitsByPrefix.get(prefix);
      if (units === undefined) {
        units = new Set<string>();
        this.unitsByPrefix.set(prefix, units);
      }
      units.add(unitId);
    }
    this.indexed.add(unitId);
    this.affected = null;
    console.debug(`reference index: ${unitId} references ${prefixes.size} prefixes`);
  }

  covers(unitId: string): boolean {
    return this.indexed.has(unitId);
  }

  // Called by the rename phase after a unit was rewritten with every rename it references, before it is saved.
  markUpToDate(unitId: string): void {
    this.upToDate.add(unitId);
    console.debug(`reference index: ${unitId} is up to date once saved`);
  }

  isUpToDate(unitId: string): boolean {
    return this.upToDate.has(unitId);
  }

  // True for a unit that was not indexed, or that references a renamed qualified name (or a member of one).
  mayReference(unitId: string, renames: QualifiedNameRenames): boolean {
    return !this.indexed.has(unitId) || this.affectedUnits(renames).has(unitId);
  }

  // True for a unit that was not indexed, or that referenced one of prefixes (Module.Name) when it was indexed.
  referencesAnyOf(unitId: string, prefixes: ReadonlySet<string>): boolean {
    if (!this.indexed.has(unitId)) {
      return true;
    }
    for (const prefix of prefixes) {
      if (this.unitsByPrefix.get(prefix)?.has(unitId) === true) {
        return true;
      }
    }
    return false;
  }

  // Cached per prefix set: QualifiedNameRenames hands out a new set after every change.
  private affectedUnits(renames: QualifiedNameRenames): ReadonlySet<string> {
    const prefixes = renames.prefixes();
    if (this.affected === null || this.affected.prefixes !== prefixes) {
      const units = new Set<string>();
      for (const prefix of prefixes) {
        this.unitsByPrefix.get(prefix)?.forEach((unitId) => units.add(unitId));
      }
      this.affected = { prefixes, units };
      console.info(`reference index: ${units.size} of ${this.indexed.size} indexed units reference a renamed name`);
    }
    return this.affected.units;
  }
}
