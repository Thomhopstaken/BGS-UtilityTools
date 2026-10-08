import { describe, expect, it } from "vitest";
import { UnitInfoCache } from "../../../EntityNameChanger/framework/UnitInfoCache";
import { fakeUnitAccess, fakeUnitInfo } from "../helpers/fakes";

describe("UnitInfoCache", () => {
  it("lists units once per access", async () => {
    const infos = [fakeUnitInfo("a", "Microflows$Microflow")];
    const access = fakeUnitAccess([], infos);
    const cache = new UnitInfoCache();
    expect(await cache.get(access)).toBe(infos);
    expect(await cache.get(access)).toBe(infos);
    expect(access.getUnitsInfoCalls).toBe(1);
  });

  it("keeps accesses apart", async () => {
    const flows = fakeUnitAccess([], [fakeUnitInfo("a", "Microflows$Microflow")]);
    const pages = fakeUnitAccess([], [fakeUnitInfo("p", "Pages$Page")]);
    const cache = new UnitInfoCache();
    expect((await cache.get(flows))[0].$ID).toBe("a");
    expect((await cache.get(pages))[0].$ID).toBe("p");
  });

  it("shares a pending call", async () => {
    const access = fakeUnitAccess([], []);
    const cache = new UnitInfoCache();
    await Promise.all([cache.get(access), cache.get(access)]);
    expect(access.getUnitsInfoCalls).toBe(1);
  });

  it("does not cache a failure", async () => {
    const access = fakeUnitAccess([], []);
    let calls = 0;
    access.getUnitsInfo = async () => {
      calls++;
      if (calls === 1) {
        throw new Error("offline");
      }
      return [];
    };
    const cache = new UnitInfoCache();
    await expect(cache.get(access)).rejects.toThrow("offline");
    expect(await cache.get(access)).toEqual([]);
    expect(calls).toBe(2);
  });
});
