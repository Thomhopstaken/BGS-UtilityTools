import type { Primitives } from "@mendix/extensions-api";
import type { RenameReport } from "../../framework/RenameReport";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult } from "../../framework/types";

export type RefreshUpdaterSpec = {
  // Plural document type, e.g. "pages"; the label becomes "Refresh pages".
  documents: string;
  unitType: string;
};

type Documented = { documentation: string };

// Last step: saves each document changed by this run twice more (documentation + " ", then reverted), so Studio Pro
// re-checks it after all other saves. Workaround for stale errors; the document ends up unchanged.
export class RefreshUpdater<TUnit extends Primitives.UnitBase = Primitives.UnitBase> implements UnitUpdater<TUnit> {
  readonly label: string;
  readonly title: string;
  readonly unitType: string;
  readonly implemented = true;
  readonly description: string;
  readonly access: UnitAccess<TUnit>;

  constructor(spec: RefreshUpdaterSpec, access: UnitAccess<TUnit>) {
    this.label = `Refresh ${spec.documents}`;
    this.title = `Refreshing ${spec.documents}`;
    this.unitType = spec.unitType;
    this.description = `Saving changed ${spec.documents} again so Studio Pro re-checks them`;
    this.access = access;
  }

  accepts(info: Readonly<Primitives.UnitInfo>, report: RenameReport): boolean {
    return report.wasChanged(info.$ID);
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
