import type { Primitives } from "@mendix/extensions-api";
import { type ExistingReferences, rewriteExistingReferences } from "../../shared/rename/existingReferences";
import type { QualifiedNameRenames } from "../../shared/rename/QualifiedNameRenames";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult } from "../../shared/rename/types";
import type { PrefixPlan } from "../framework/PrefixPlan";

export type DocumentRenamerSpec = {
  readonly unitType: string;
  // Singular, e.g. "microflow".
  readonly kind: string;
  // Plural with a capital, e.g. "Microflows".
  readonly label: string;
  // The reference pass for this type: its references are rewritten in the rename save. Null: the type references no
  // documents, only the name changes.
  readonly references: { readonly onlyProperties?: ReadonlySet<string> } | null;
};

export type DocumentRenamerDeps = {
  readonly plan: PrefixPlan;
  readonly renames: QualifiedNameRenames;
  readonly existing: ExistingReferences;
};

// Renames the planned documents of one type. The rename save also rewrites references to names that exist already,
// its own rename included (recursive calls, Module.Page.Parameter).
export class DocumentRenamer<TUnit extends Primitives.UnitBase = Primitives.UnitBase> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly title: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description: string;
  readonly access: UnitAccess<TUnit>;
  private readonly spec: DocumentRenamerSpec;
  private readonly deps: DocumentRenamerDeps;

  constructor(spec: DocumentRenamerSpec, access: UnitAccess<TUnit>, deps: DocumentRenamerDeps) {
    this.spec = spec;
    this.label = spec.label;
    this.title = `Renaming ${spec.kind}s`;
    this.unitType = spec.unitType;
    this.description = `Renaming ${spec.kind}s`;
    this.access = access;
    this.deps = deps;
  }

  // No planned rename of this type: the step lists nothing.
  isIdle(): boolean {
    return this.deps.plan.countOf(this.unitType) === 0;
  }

  accepts(info: Readonly<Primitives.UnitInfo>): boolean {
    return this.deps.plan.has(info.$ID);
  }

  async update(unit: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    const planned = this.deps.plan.get(info.$ID);
    if (planned === undefined) {
      return { ...UNCHANGED };
    }
    const document = unit as TUnit & { name: string };
    if (document.name !== planned.document.name) {
      throw new Error(`renamed to ${document.name} since planning; left as it is`);
    }
    document.name = planned.newName;
    let references = 0;
    if (this.spec.references !== null) {
      const { isSaved, index } = this.deps.existing;
      // Its own rename exists once this save is done.
      const existing = { isSaved: (id: string) => id === info.$ID || isSaved(id), index };
      references = rewriteExistingReferences(unit, info, this.deps.renames, existing, this.spec.references.onlyProperties);
    }
    console.info(`${this.label}: ${info.moduleName}.${planned.document.name} -> ${planned.newName}, ${references} references updated`);
    return { ...UNCHANGED, changed: true, renamedTo: planned.newName, updatedReferences: references };
  }
}
