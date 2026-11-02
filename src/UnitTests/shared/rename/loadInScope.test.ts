import { describe, expect, it } from "vitest";
import { loadInScope } from "../../../shared/rename/loadInScope";
import { UnitInfoCache } from "../../../shared/rename/UnitInfoCache";
import { fakeScope, fakeUnit, fakeUnitAccess, fakeUnitInfo } from "../helpers/fakes";

const DM = "DomainModels$DomainModel";

describe("loadInScope", () => {
  it("loads the units of one type in the own modules, with their info, in batches with explicit counts", async () => {
    const infos = [
      fakeUnitInfo("a", DM, "M"),
      fakeUnitInfo("b", DM, "N"),
      fakeUnitInfo("c", DM, "O"),
      fakeUnitInfo("s", DM, "System"),
      fakeUnitInfo("x", "Other$Type", "M"),
    ];
    const access = fakeUnitAccess(["a", "b", "c", "s", "x"].map((id) => fakeUnit(id)), infos);
    const loaded = await loadInScope(access, DM, new UnitInfoCache(), fakeScope(), 2);
    expect(loaded.map(({ info, unit }) => [info.moduleName, unit.$ID])).toEqual([
      ["M", "a"],
      ["N", "b"],
      ["O", "c"],
    ]);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
  });

  it("loads nothing without units in scope", async () => {
    const access = fakeUnitAccess([fakeUnit("s")], [fakeUnitInfo("s", DM, "System")]);
    expect(await loadInScope(access, DM, new UnitInfoCache(), fakeScope())).toEqual([]);
    expect(access.loadCalls).toEqual([]);
  });

  it("shares the listing with the job", async () => {
    const access = fakeUnitAccess([fakeUnit("a")], [fakeUnitInfo("a", DM)]);
    const unitInfos = new UnitInfoCache();
    await unitInfos.get(access);
    await loadInScope(access, DM, unitInfos, fakeScope());
    expect(access.getUnitsInfoCalls).toBe(1);
  });
});
