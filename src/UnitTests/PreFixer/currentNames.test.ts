import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { currentNameLoader } from "../../PreFixer/currentNames";
import type { AppModel } from "../../shared/rename/referenceTypes";
import { MF, PAGE } from "./helpers/fakeModel";

// A model API with these units; loadAll filters their infos like Studio Pro does.
function api(units: { $ID: string; name?: string }[]) {
  return {
    loadAll: vi.fn(async (filter: (info: Primitives.UnitInfo) => boolean, _max?: number) =>
      units.filter((unit) => filter({ $ID: unit.$ID, $Type: "x" } as Primitives.UnitInfo)),
    ),
  };
}

describe("currentNameLoader", () => {
  it("loads only the given ids through the type's model API, capped at their count", async () => {
    const microflows = api([{ $ID: "1", name: "ACT_A" }, { $ID: "2", name: "SUB_B" }, { $ID: "3", name: "Other" }]);
    const pages = api([]);
    const load = currentNameLoader({ microflows, pages } as unknown as Partial<AppModel>);
    expect(await load(MF, new Set(["1", "2"]))).toEqual([
      { $ID: "1", name: "ACT_A" },
      { $ID: "2", name: "SUB_B" },
    ]);
    expect(microflows.loadAll.mock.calls[0][1]).toBe(2);
    expect(pages.loadAll).not.toHaveBeenCalled();
  });

  it("returns no entry for a document that is gone", async () => {
    const load = currentNameLoader({ pages: api([]) } as unknown as Partial<AppModel>);
    expect(await load(PAGE, new Set(["9"]))).toEqual([]);
  });

  it("fails for a type it can't rename or an API that is missing", async () => {
    const load = currentNameLoader({} as Partial<AppModel>);
    await expect(load("Some$FutureType", new Set(["1"]))).rejects.toThrow("no model API for Some$FutureType");
    await expect(load(MF, new Set(["1"]))).rejects.toThrow("model API microflows not available");
  });
});
