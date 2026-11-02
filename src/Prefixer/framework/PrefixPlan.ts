import type { AppDocument } from "../prefixModel";

export type PlannedRename = {
  readonly document: AppDocument;
  readonly newName: string;
};

// The renames decided by the plan step, per unit id; read by the renamers and the check step.
export class PrefixPlan {
  private readonly renames = new Map<string, PlannedRename>();
  private readonly perType = new Map<string, number>();

  get size(): number {
    return this.renames.size;
  }

  add(document: AppDocument, newName: string): void {
    this.renames.set(document.$ID, { document, newName });
    this.perType.set(document.$Type, (this.perType.get(document.$Type) ?? 0) + 1);
    console.debug(`prefix plan: ${document.moduleName}.${document.name} -> ${newName}`);
  }

  get(unitId: string): PlannedRename | undefined {
    return this.renames.get(unitId);
  }

  has(unitId: string): boolean {
    return this.renames.has(unitId);
  }

  countOf(unitType: string): number {
    return this.perType.get(unitType) ?? 0;
  }

  all(): PlannedRename[] {
    return [...this.renames.values()];
  }
}
