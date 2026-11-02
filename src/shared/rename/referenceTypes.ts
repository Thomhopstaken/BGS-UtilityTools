import type { Primitives, StudioProApi } from "@mendix/extensions-api";
import type { QualifiedNameRenames } from "./QualifiedNameRenames";
import type { ReferenceIndex } from "./ReferenceIndex";
import { ReferenceUpdater } from "./ReferenceUpdater";
import type { UnitAccess, UnitUpdater } from "./types";

// The app.model part of the Studio Pro API.
export type AppModel = StudioProApi["app"]["model"];

// A document type of a reference pass; api is its app.model property.
export type ReferenceDocumentType = {
  // Plural, e.g. "microflows".
  readonly documents: string;
  readonly unitType: string;
  readonly api: keyof AppModel;
  // Only these properties are rewritten; all string properties when absent. "Type$Element.key" limits a key to one
  // element type.
  readonly onlyProperties?: ReadonlySet<string>;
};

// One reference updater per type, in the order given; the order is the order of the reference pass.
export function createReferenceUpdaters(
  model: AppModel,
  types: readonly ReferenceDocumentType[],
  renames: QualifiedNameRenames,
  index?: ReferenceIndex,
  description?: string,
): UnitUpdater[] {
  const updaters = types.map(
    (type) =>
      new ReferenceUpdater(
        { documents: type.documents, unitType: type.unitType, onlyProperties: type.onlyProperties, description },
        model[type.api] as unknown as UnitAccess<Primitives.UnitBase>,
        renames,
        index,
      ),
  );
  console.debug(`reference updaters: ${updaters.map((u) => u.label).join(", ")}`);
  return updaters;
}
