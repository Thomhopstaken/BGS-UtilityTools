import type { Primitives } from "@mendix/extensions-api";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult } from "../../framework/types";
import { rewriteQualifiedNamesInUnit } from "../shared/qualifiedNameRewrite";

export type ReferenceUpdaterSpec = {
  // Plural document type, e.g. "microflows"; the label becomes "References in microflows".
  documents: string;
  unitType: string;
};

// Reference pass: rewrites references to everything renamed (entity, documents, parameters). Runs last, after
// every renamed name exists, so Studio Pro checks each saved document against existing names.
export class ReferenceUpdater<TUnit extends Primitives.UnitBase = Primitives.UnitBase> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description = "Updating references to renamed entity, documents and parameters";
  readonly access: UnitAccess<TUnit>;
  private readonly renames: QualifiedNameRenames;

  constructor(spec: ReferenceUpdaterSpec, access: UnitAccess<TUnit>, renames: QualifiedNameRenames) {
    this.label = `References in ${spec.documents}`;
    this.unitType = spec.unitType;
    this.access = access;
    this.renames = renames;
  }

  async update(unit: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    console.debug(`${this.label}: checking ${info.moduleName}.${info.name} against ${this.renames.size} renames`);
    const references = rewriteQualifiedNamesInUnit(unit, this.renames.map);
    if (references === 0) {
      return { ...UNCHANGED };
    }
    console.info(`${this.label}: ${info.moduleName}.${info.name}: ${references} references updated`);
    return { ...UNCHANGED, changed: true, updatedReferences: references };
  }
}
