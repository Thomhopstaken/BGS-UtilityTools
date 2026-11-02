import { describe, expect, it, vi } from "vitest";
import { fakeContext, fakeUnitAccess, fakeUnitInfo, fakeUpdater } from "../helpers/fakes";
import { chunk, planBatches } from "../../../EntityNameChanger/framework/RenamePlanner";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";
import { UnitInfoCache } from "../../../EntityNameChanger/framework/UnitInfoCache";

describe("chunk", () => {
  it("splits with a smaller last chunk", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no chunks for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("throws for size below 1", () => {
    expect(() => chunk([1], 0)).toThrow("chunk size must be at least 1, got 0");
  });
});

describe("planBatches", () => {
  const context = fakeContext({ excludedModules: new Set(["System", "Marketplace"]) });

  it("filters by unit type and scope, and numbers batches 1-based", async () => {
    const access = fakeUnitAccess(
      [],
      [
        fakeUnitInfo("a", "Microflows$Microflow"),
        fakeUnitInfo("b", "Microflows$Nanoflow"),
        fakeUnitInfo("c", "Microflows$Microflow", "Marketplace"),
        fakeUnitInfo("d", "Microflows$Microflow"),
        { $ID: "e", $Type: "Microflows$Microflow" } as never,
        fakeUnitInfo("f", "Microflows$Microflow"),
      ],
    );
    const updater = fakeUpdater(access);
    const batches = await planBatches([updater], context, 2);
    expect(batches.map((b) => b.infos.map((i) => i.$ID))).toEqual([["a", "d"], ["f"]]);
    expect(batches.map((b) => [b.first, b.last, b.total])).toEqual([
      [1, 2, 3],
      [3, 3, 3],
    ]);
    expect(batches[0].updater).toBe(updater);
  });

  it("skips stubs without reading unit info", async () => {
    const access = fakeUnitAccess([], [fakeUnitInfo("a", "Microflows$Microflow")]);
    const batches = await planBatches([fakeUpdater(access, undefined, { implemented: false })], context);
    expect(batches).toEqual([]);
    expect(access.getUnitsInfoCalls).toBe(0);
  });

  it("keeps updater order and plans nothing for an updater without units", async () => {
    const first = fakeUpdater(fakeUnitAccess([], [fakeUnitInfo("a", "Microflows$Microflow")]));
    const empty = fakeUpdater(fakeUnitAccess([], []), undefined, { label: "Rules", unitType: "Microflows$Rule" });
    const last = fakeUpdater(fakeUnitAccess([], [fakeUnitInfo("p", "Pages$Page")]), undefined, {
      label: "Pages",
      unitType: "Pages$Page",
    });
    const batches = await planBatches([first, empty, last], context);
    expect(batches.map((b) => b.updater.label)).toEqual(["Microflows", "Pages"]);
  });

  it("lists units through the cache when given", async () => {
    const access = fakeUnitAccess([], [fakeUnitInfo("a", "Microflows$Microflow")]);
    const cache = new UnitInfoCache();
    await planBatches([fakeUpdater(access)], context, 2, cache);
    const batches = await planBatches([fakeUpdater(access)], context, 2, cache);
    expect(batches.map((b) => b.infos.map((i) => i.$ID))).toEqual([["a"]]);
    expect(access.getUnitsInfoCalls).toBe(1);
  });

  it("uses the default batch size of 100", async () => {
    const infos = Array.from({ length: 101 }, (_, i) => fakeUnitInfo(`u${i}`, "Microflows$Microflow"));
    const batches = await planBatches([fakeUpdater(fakeUnitAccess([], infos))], context);
    expect(batches.map((b) => b.infos.length)).toEqual([100, 1]);
  });

  it("with a report, batches only accepted units and numbers them among those", async () => {
    const infos = ["a", "b", "c", "d"].map((id) => fakeUnitInfo(id, "Microflows$Microflow"));
    const report = new RenameReport();
    const accepts = vi.fn((info: { $ID: string }, r: RenameReport) => r === report && info.$ID !== "b");
    const updater = { ...fakeUpdater(fakeUnitAccess([], infos)), accepts };
    const batches = await planBatches([updater], context, 2, undefined, report);
    expect(batches.map((b) => [b.infos.map((i) => i.$ID), b.first, b.last, b.total])).toEqual([
      [["a", "c"], 1, 2, 3],
      [["d"], 3, 3, 3],
    ]);
    expect(accepts).toHaveBeenCalledTimes(4);
  });

  it("without a report, leaves accepting to the caller", async () => {
    const infos = ["a", "b"].map((id) => fakeUnitInfo(id, "Microflows$Microflow"));
    const updater = { ...fakeUpdater(fakeUnitAccess([], infos)), accepts: () => false };
    expect((await planBatches([updater], context, 2)).map((b) => b.infos.length)).toEqual([2]);
  });
});
