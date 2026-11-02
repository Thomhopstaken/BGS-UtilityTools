import type { Primitives } from "@mendix/extensions-api";
import type { QualifiedNameRenames } from "../../shared/rename/QualifiedNameRenames";
import type { ReferenceIndex } from "../../shared/rename/ReferenceIndex";
import { type AppModel, createReferenceUpdaters } from "../../shared/rename/referenceTypes";
import type { UnitAccess, UnitUpdater } from "../../shared/rename/types";
import { RENAMABLE_DOCUMENT_TYPES } from "../documentTypes";
import type { ScanSource } from "../framework/MarketplaceScanStep";
import type { PrefixPlan } from "../framework/PrefixPlan";
import { PREFIX_REFERENCE_DOCUMENT_TYPES } from "../referenceTypes";
import { DocumentRenamer } from "./DocumentRenamer";

export type PrefixUpdaterDeps = {
  readonly plan: PrefixPlan;
  readonly renames: QualifiedNameRenames;
  // Marks units saved with every rename they reference; the reference pass skips them.
  readonly index: ReferenceIndex;
  // Whether a unit was saved in this job.
  readonly isSaved: (unitId: string) => boolean;
};

export type PrefixUpdaters = {
  // One per renamable type, callees first; only the chosen group's have work.
  renamers: UnitUpdater[];
  // The reference pass, in PREFIX_REFERENCE_DOCUMENT_TYPES order.
  referenceUpdaters: UnitUpdater[];
  // What the Marketplace scan loads: the reference pass types.
  scanSources: ScanSource[];
};

// The only place that turns the Prefixer's document types into app.model APIs.
export function createPrefixUpdaters(model: AppModel, deps: PrefixUpdaterDeps): PrefixUpdaters {
  const access = (api: keyof AppModel) => model[api] as unknown as UnitAccess<Primitives.UnitBase>;
  const referenceSpec = new Map(PREFIX_REFERENCE_DOCUMENT_TYPES.map((type) => [type.unitType, type]));
  const existing = { isSaved: deps.isSaved, index: deps.index };
  const renamers: UnitUpdater[] = RENAMABLE_DOCUMENT_TYPES.map((type) => {
    const reference = referenceSpec.get(type.unitType);
    return new DocumentRenamer(
      {
        unitType: type.unitType,
        kind: type.kind,
        label: `Rename ${type.kind}s`,
        references: reference === undefined ? null : { onlyProperties: reference.onlyProperties },
      },
      access(type.api),
      { plan: deps.plan, renames: deps.renames, existing },
    );
  });
  const referenceUpdaters = createReferenceUpdaters(
    model,
    PREFIX_REFERENCE_DOCUMENT_TYPES,
    deps.renames,
    deps.index,
    "Updating references to renamed documents",
  );
  const scanSources = PREFIX_REFERENCE_DOCUMENT_TYPES.map((type) => ({ unitType: type.unitType, access: access(type.api) }));
  console.info(`prefix updaters: ${renamers.length} renamers, ${referenceUpdaters.length} reference updaters`);
  return { renamers, referenceUpdaters, scanSources };
}
