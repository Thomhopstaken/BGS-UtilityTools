import { describe, expect, it } from "vitest";
import { RENAMABLE_DOCUMENT_TYPES } from "../../../Prefixer/documentTypes";
import { PrefixPlan } from "../../../Prefixer/framework/PrefixPlan";
import { PREFIX_REFERENCE_DOCUMENT_TYPES } from "../../../Prefixer/referenceTypes";
import { DocumentRenamer } from "../../../Prefixer/updaters/DocumentRenamer";
import { createPrefixUpdaters } from "../../../Prefixer/updaters/updaterRegistry";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { ReferenceIndex } from "../../../shared/rename/ReferenceIndex";
import { fakeAppModel } from "../helpers/fakeModel";

function updaters() {
  const fake = fakeAppModel([]);
  const result = createPrefixUpdaters(fake.model, { plan: new PrefixPlan(), renames: new QualifiedNameRenames(), index: new ReferenceIndex(), isSaved: () => false });
  return { fake, ...result };
}

describe("createPrefixUpdaters", () => {
  it("makes one renamer per renamable type, in order, on its model API", () => {
    const { fake, renamers } = updaters();
    expect(renamers.map((r) => r.unitType)).toEqual(RENAMABLE_DOCUMENT_TYPES.map((t) => t.unitType));
    expect(renamers.every((r) => r instanceof DocumentRenamer)).toBe(true);
    RENAMABLE_DOCUMENT_TYPES.forEach((type, i) => expect(renamers[i].access).toBe(fake.api(type.api)));
    expect(renamers.find((r) => r.unitType === "Microflows$Microflow")?.label).toBe("Rename microflows");
  });

  it("makes the reference pass in its order with the Prefixer wording", () => {
    const { fake, referenceUpdaters } = updaters();
    expect(referenceUpdaters.map((r) => r.unitType)).toEqual(PREFIX_REFERENCE_DOCUMENT_TYPES.map((t) => t.unitType));
    PREFIX_REFERENCE_DOCUMENT_TYPES.forEach((type, i) => expect(referenceUpdaters[i].access).toBe(fake.api(type.api)));
    expect(new Set(referenceUpdaters.map((r) => r.description))).toEqual(new Set(["Updating references to renamed documents"]));
  });

  it("scans the reference pass types for Marketplace references", () => {
    const { fake, scanSources } = updaters();
    expect(scanSources.map((s) => s.unitType)).toEqual(PREFIX_REFERENCE_DOCUMENT_TYPES.map((t) => t.unitType));
    expect(scanSources[0].access).toBe(fake.api(PREFIX_REFERENCE_DOCUMENT_TYPES[0].api));
  });
});
