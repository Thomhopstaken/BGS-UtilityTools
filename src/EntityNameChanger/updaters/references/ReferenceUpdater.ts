import type { Primitives } from "@mendix/extensions-api";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";
import type { ReferenceIndex } from "../../framework/ReferenceIndex";
import type { RenameReport } from "../../framework/RenameReport";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult } from "../../framework/types";
import { rewriteQualifiedNamesInUnit } from "../shared/qualifiedNameRewrite";

export type ReferenceUpdaterSpec = {
  // Plural document type, e.g. "microflows"; the label becomes "References in microflows".
  documents: string;
  unitType: string;
  // Only these properties are rewritten; all string properties when absent.
  onlyProperties?: ReadonlySet<string>;
};

// Reference pass: rewrites references to everything renamed (entity, documents, parameters). Runs last, after
// every renamed name exists, so Studio Pro checks each saved document against existing names.
export class ReferenceUpdater<TUnit extends Primitives.UnitBase = Primitives.UnitBase> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description = "Updating references to renamed entity, documents and parameters";
  readonly access: UnitAccess<TUnit>;
  readonly onlyProperties?: ReadonlySet<string>;
  private readonly renames: QualifiedNameRenames;
  // Units loaded in the plan phase; only those referencing a renamed name are loaded again. All units when absent.
  private readonly index?: ReferenceIndex;

  constructor(spec: ReferenceUpdaterSpec, access: UnitAccess<TUnit>, renames: QualifiedNameRenames, index?: ReferenceIndex) {
    this.label = `References in ${spec.documents}`;
    this.unitType = spec.unitType;
    this.onlyProperties = spec.onlyProperties;
    this.access = access;
    this.renames = renames;
    this.index = index;
  }

  // Skips units that reference no renamed name, and units the rename phase saved with every rename already.
  accepts(info: Readonly<Primitives.UnitInfo>, report?: RenameReport): boolean {
    if (this.index === undefined) {
      return true;
    }
    if (this.index.isUpToDate(info.$ID) && report?.wasChanged(info.$ID) === true) {
      console.debug(`${this.label}: ${info.moduleName}.${info.name} was saved up to date in the rename phase`);
      return false;
    }
    return this.index.mayReference(info.$ID, this.renames);
  }

  async update(unit: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    const scope = this.onlyProperties === undefined ? "all properties" : `[${[...this.onlyProperties].join(", ")}]`;
    console.debug(`${this.label}: checking ${scope} of ${info.moduleName}.${info.name} against ${this.renames.size} renames`);
    const references = rewriteQualifiedNamesInUnit(unit, this.renames.map, this.onlyProperties);
    if (references === 0) {
      return { ...UNCHANGED };
    }
    console.info(`${this.label}: ${info.moduleName}.${info.name}: ${references} references updated`);
    return { ...UNCHANGED, changed: true, updatedReferences: references };
  }
}
