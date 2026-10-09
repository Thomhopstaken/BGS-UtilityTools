import type * as Mx from "@mendix/extensions-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppstoreModuleNames, getEntities, loadPaneData } from "../../EntityNameChanger/moduleModel";
import { fakeUnitInfo } from "./helpers/fakes";

// The real package needs Studio Pro at runtime; only getContainer is used.
const { getContainer } = vi.hoisted(() => ({ getContainer: vi.fn() }));
vi.mock("@mendix/extensions-api", () => ({ getContainer }));

const module = (name: string, fromAppStore = false) => ({ name, fromAppStore }) as unknown as Mx.Projects.Module;
const entity = (name: string) => ({ $ID: `id-${name}`, name }) as unknown as Mx.DomainModels.Entity;
const domainModelInfos = [fakeUnitInfo("dm-1", "DomainModels$DomainModel", "MyModule")];

beforeEach(() => {
  getContainer.mockReset();
});

describe("getAppstoreModuleNames", () => {
  it("always includes System and adds marketplace modules", () => {
    expect([...getAppstoreModuleNames([module("MyModule"), module("Atlas_Core", true)])]).toEqual(["System", "Atlas_Core"]);
  });

  it("returns only System without marketplace modules", () => {
    expect([...getAppstoreModuleNames([])]).toEqual(["System"]);
  });
});

describe("getEntities", () => {
  it("loads own domain models only and flattens their entities", async () => {
    const loadAll = vi.fn(async (filter: (info: Mx.Primitives.UnitInfo) => boolean, _max?: number) =>
      [{ entities: [entity("Order"), entity("Customer")] }, { entities: [entity("Invoice")] }] as unknown as Mx.DomainModels.DomainModel[],
    );
    const domainModels = { loadAll } as unknown as Parameters<typeof getEntities>[0];
    const appStore = new Set(["System", "Atlas_Core"]);
    const entities = await getEntities(domainModels, [module("System"), module("Atlas_Core", true), module("MyModule"), module("Other")], appStore);
    expect(entities.map((e) => e.name)).toEqual(["Order", "Customer", "Invoice"]);
    const [filter, max] = loadAll.mock.calls[0];
    expect(max).toBe(2);
    expect(filter({ moduleName: "MyModule" } as Mx.Primitives.UnitInfo)).toBe(true);
    expect(filter({ moduleName: "Atlas_Core" } as Mx.Primitives.UnitInfo)).toBe(false);
    expect(filter({ moduleName: "System" } as Mx.Primitives.UnitInfo)).toBe(false);
    expect(filter({} as Mx.Primitives.UnitInfo)).toBe(false);
  });
});

describe("loadPaneData", () => {
  it("loads own modules' entities grouped by module, with the excluded modules", async () => {
    getContainer.mockReturnValue({ $ID: "dm-1" });
    const modules = { getModules: vi.fn(async () => [module("System"), module("Atlas_Core", true), module("MyModule")]) };
    const loadAll = vi.fn(async () => [{ entities: [entity("Order"), entity("Customer")] }] as unknown as Mx.DomainModels.DomainModel[]);
    const getUnitsInfo = vi.fn(async () => domainModelInfos);
    const domainModels = { loadAll, getUnitsInfo } as unknown as Parameters<typeof loadPaneData>[1];
    const data = await loadPaneData(modules, domainModels);
    expect([...data.excludedModules]).toEqual(["System", "Atlas_Core"]);
    expect([...data.byModule.keys()]).toEqual(["MyModule"]);
    expect(data.byModule.get("MyModule")!.map((o) => o.name)).toEqual(["Customer", "Order"]);
    expect(loadAll.mock.calls[0]).toHaveLength(2);
  });
});
