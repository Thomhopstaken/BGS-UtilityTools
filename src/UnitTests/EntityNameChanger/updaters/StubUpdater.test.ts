import { describe, expect, it } from "vitest";
import { UNCHANGED } from "../../../EntityNameChanger/framework/types";
import { fakeUnit, fakeUnitAccess, fakeUnitInfo } from "../helpers/fakes";
import { createStubUpdater } from "../../../EntityNameChanger/updaters/StubUpdater";

describe("createStubUpdater", () => {
  const access = fakeUnitAccess([]);
  const stub = createStubUpdater("Rules", "Microflows$Rule", access, "Renaming rules");

  it("is not implemented and keeps its metadata", () => {
    expect(stub).toMatchObject({ label: "Rules", unitType: "Microflows$Rule", implemented: false, description: "Renaming rules" });
    expect(stub.access).toBe(access);
  });

  it("returns an unchanged result that is a mutable copy", async () => {
    const result = await stub.update(fakeUnit("r"), fakeUnitInfo("r", "Microflows$Rule"));
    expect(result).toEqual(UNCHANGED);
    expect(result).not.toBe(UNCHANGED);
    expect(Object.isFrozen(result)).toBe(false);
  });
});
