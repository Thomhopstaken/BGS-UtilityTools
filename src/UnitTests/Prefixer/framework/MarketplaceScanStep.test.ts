import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { MarketplaceScanStep } from "../../../Prefixer/framework/MarketplaceScanStep";
import { PrefixJobState } from "../../../Prefixer/framework/PrefixJobState";
import { UnitInfoCache } from "../../../shared/rename/UnitInfoCache";
import { fakeUnit, fakeUnitAccess, fakeUnitInfo } from "../../shared/helpers/fakes";
import { appDocument, MF, PAGE } from "../helpers/fakeModel";

function state(): PrefixJobState {
  const result = new PrefixJobState();
  result.candidates = [appDocument("mf-1", MF, "ACT_Order_Save"), appDocument("mf-2", MF, "ACT_Order_Show")];
  result.marketplaceModules = new Set(["Atlas_Core"]);
  return result;
}

const marketplacePage = fakeUnit("p1", { $Type: PAGE, name: "Atlas_Page", widgets: [{ $Type: "W", microflow: "M.ACT_Order_Save" }] });
const ownPage = fakeUnit("p2", { $Type: PAGE, name: "Own_Page", widgets: [{ $Type: "W", microflow: "M.ACT_Order_Show" }] });

function pages(units: Primitives.UnitBase[] = [marketplacePage, ownPage]) {
  return fakeUnitAccess(units, [fakeUnitInfo("p1", PAGE, "Atlas_Core", "Atlas_Page"), fakeUnitInfo("p2", PAGE, "M", "Own_Page")]);
}

describe("MarketplaceScanStep", () => {
  it("records the candidates Marketplace documents reference, loading only Marketplace units", async () => {
    const access = pages();
    const jobState = state();
    const step = new MarketplaceScanStep({ sources: [{ unitType: PAGE, access }], unitInfos: new UnitInfoCache(), state: jobState });
    expect(await step.run()).toBe(true);
    expect([...jobState.marketplaceReferences]).toEqual([["M.ACT_Order_Save", "Atlas_Core.Atlas_Page"]]);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 1 }]);
    expect(access.saved).toEqual([]);
  });

  it("loads in batches and never saves", async () => {
    const units = ["a", "b", "c"].map((id) => fakeUnit(id, { $Type: PAGE, name: id }));
    const access = fakeUnitAccess(units, ["a", "b", "c"].map((id) => fakeUnitInfo(id, PAGE, "Atlas_Core")));
    const step = new MarketplaceScanStep({ sources: [{ unitType: PAGE, access }], unitInfos: new UnitInfoCache(), state: state(), batchSize: 2 });
    expect(await step.run()).toBe(true);
    expect(access.loadCalls).toEqual([{ maxUnitsToLoad: 2 }, { maxUnitsToLoad: 1 }]);
    expect(access.saved).toEqual([]);
  });

  it("lists and loads nothing without candidates or Marketplace modules", async () => {
    const access = pages();
    const noCandidates = new PrefixJobState();
    noCandidates.marketplaceModules = new Set(["Atlas_Core"]);
    expect(await new MarketplaceScanStep({ sources: [{ unitType: PAGE, access }], unitInfos: new UnitInfoCache(), state: noCandidates }).run()).toBe(true);
    const noModules = state();
    noModules.marketplaceModules = new Set();
    expect(await new MarketplaceScanStep({ sources: [{ unitType: PAGE, access }], unitInfos: new UnitInfoCache(), state: noModules }).run()).toBe(true);
    expect(access.getUnitsInfoCalls).toBe(0);
  });

  it("only scans units of the source's type", async () => {
    const access = fakeUnitAccess([marketplacePage], [fakeUnitInfo("p1", "Pages$Snippet", "Atlas_Core")]);
    const jobState = state();
    await new MarketplaceScanStep({ sources: [{ unitType: PAGE, access }], unitInfos: new UnitInfoCache(), state: jobState }).run();
    expect(access.loadCalls).toEqual([]);
    expect(jobState.marketplaceReferences.size).toBe(0);
  });

  it("stops the job when a Marketplace document can't be loaded", async () => {
    const access = pages();
    access.loadError = new Error("gone");
    const step = new MarketplaceScanStep({ sources: [{ unitType: PAGE, access }], unitInfos: new UnitInfoCache(), state: state() });
    expect(await step.run()).toBe("Could not check the Marketplace modules: Error: gone");
  });
});
