import type * as Mx from "@mendix/extensions-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppstoreModuleNames, getEntities, getEntityLocation, setQualifiedName } from "../../EntityNameChanger/moduleModel";
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

describe("getEntityLocation", () => {
  it("returns the domain model and module of the entity", () => {
    getContainer.mockReturnValue({ $ID: "dm-1" });
    expect(getEntityLocation(entity("Order"), domainModelInfos)).toEqual({ domainModelId: "dm-1", moduleName: "MyModule" });
  });

  it("returns null without a container", () => {
    getContainer.mockReturnValue(undefined);
    expect(getEntityLocation(entity("Order"), domainModelInfos)).toBeNull();
  });

  it("returns null when the domain model is not in the unit infos", () => {
    getContainer.mockReturnValue({ $ID: "dm-unknown" });
    expect(getEntityLocation(entity("Order"), domainModelInfos)).toBeNull();
  });
});

describe("setQualifiedName", () => {
  it("prefixes the module name", () => {
    getContainer.mockReturnValue({ $ID: "dm-1" });
    expect(setQualifiedName(entity("Order"), domainModelInfos)).toBe("MyModule.Order");
  });

  it("shows undefined for an unknown module", () => {
    getContainer.mockReturnValue(undefined);
    expect(setQualifiedName(entity("Order"), domainModelInfos)).toBe("undefined.Order");
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
