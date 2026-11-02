import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { ReferenceIndex } from "../../../shared/rename/ReferenceIndex";
import { type AppModel, createReferenceUpdaters } from "../../../shared/rename/referenceTypes";
import { ReferenceUpdater } from "../../../shared/rename/ReferenceUpdater";
import { fakeUnitAccess, fakeUnitInfo } from "../helpers/fakes";

const pages = fakeUnitAccess<Primitives.UnitBase>([]);
const constants = fakeUnitAccess<Primitives.UnitBase>([]);
const model = { pages, constants } as unknown as AppModel;

describe("createReferenceUpdaters", () => {
  it("makes one reference updater per type, in order, on its model API", () => {
    const updaters = createReferenceUpdaters(
      model,
      [
        { documents: "constants", unitType: "Constants$Constant", api: "constants" },
        { documents: "pages", unitType: "Pages$Page", api: "pages", onlyProperties: new Set(["page"]) },
      ],
      new QualifiedNameRenames(),
    );
    expect(updaters.map((u) => [u.label, u.unitType])).toEqual([
      ["References in constants", "Constants$Constant"],
      ["References in pages", "Pages$Page"],
    ]);
    expect(updaters.every((u) => u instanceof ReferenceUpdater)).toBe(true);
    expect(updaters[0].access).toBe(constants);
    expect(updaters[1].access).toBe(pages);
    expect((updaters[1] as ReferenceUpdater).onlyProperties).toEqual(new Set(["page"]));
  });

  it("passes the description, renames and index to every updater", () => {
    const renames = new QualifiedNameRenames();
    renames.add("M.A", "M.B");
    const index = new ReferenceIndex();
    index.add("p1", { $Type: "Pages$Page", name: "P" });
    const [updater] = createReferenceUpdaters(model, [{ documents: "pages", unitType: "Pages$Page", api: "pages" }], renames, index, "Updating references to renamed documents");
    expect(updater.description).toBe("Updating references to renamed documents");
    expect(updater.isIdle?.(undefined as never)).toBe(false);
    // Indexed without a renamed name: skipped.
    expect(updater.accepts?.(fakeUnitInfo("p1", "Pages$Page"), undefined as never)).toBe(false);
  });
});
