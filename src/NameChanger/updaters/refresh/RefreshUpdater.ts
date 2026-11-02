import type { Primitives } from "@mendix/extensions-api";
import type { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import type { ReferenceIndex } from "../../../shared/rename/ReferenceIndex";
import type { RenameReport } from "../../framework/RenameReport";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult } from "../../../shared/rename/types";

export type RefreshUpdaterSpec = {
  // Plural document type, e.g. "pages"; the label becomes "Refresh pages".
  documents: string;
  unitType: string;
};

// The property the refresh touches.
type Documented = { documentation: string };

// Which changed documents need a refresh: only those that referenced a document whose parameters were renamed.
export type RefreshFilter = {
  index: ReferenceIndex;
  renames: QualifiedNameRenames;
};

// Last step: saves each document changed by this run twice more (documentation + " ", then reverted), so Studio Pro
// re-checks it after all other saves. Workaround for stale errors; the document ends up unchanged.
// The stale errors seen were CE0115/CE0117 on pages calling a flow with renamed parameters, so with a filter only
// changed documents calling a document with renamed parameters are refreshed.
// UNVERIFIED: no other kind of stale error needs the refresh.
export class RefreshUpdater<TUnit extends Primitives.UnitBase = Primitives.UnitBase> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly title: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description: string;
  readonly access: UnitAccess<TUnit>;
  private readonly filter?: RefreshFilter;
  // Prefixes of documents with renamed parameters; set on first accepts.
  private parameterOwners: ReadonlySet<string> | null = null;

  constructor(spec: RefreshUpdaterSpec, access: UnitAccess<TUnit>, filter?: RefreshFilter) {
    this.label = `Refresh ${spec.documents}`;
    this.title = `Refreshing ${spec.documents}`;
    this.unitType = spec.unitType;
    this.description = `Saving changed ${spec.documents} again so Studio Pro re-checks them`;
    this.access = access;
    this.filter = filter;
  }

  accepts(info: Readonly<Primitives.UnitInfo>, report: RenameReport): boolean {
    if (!report.wasChanged(info.$ID)) {
      return false;
    }
    if (this.filter === undefined) {
      return true;
    }
    // Renames are final after planning, so the owners are computed once.
    this.parameterOwners ??= this.filter.renames.parameterOwnerPrefixes();
    const accepted = this.filter.index.referencesAnyOf(info.$ID, this.parameterOwners);
    console.debug(`${this.label}: ${info.moduleName}.${info.name} ${accepted ? "calls" : "calls no"} document with renamed parameters`);
    return accepted;
  }

  // Saves the touched unit here; the job saves the reverted one.
  async update(unit: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    const document = unit as unknown as Documented;
    const original = document.documentation ?? "";
    document.documentation = `${original} `;
    try {
      await this.access.save(unit);
    } finally {
      document.documentation = original;
    }
    console.info(`${this.label}: touched ${info.moduleName}.${info.name}, saving it reverted`);
    return { ...UNCHANGED, changed: true };
  }
}
