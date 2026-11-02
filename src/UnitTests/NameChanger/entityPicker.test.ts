import type * as Mx from "@mendix/extensions-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allEntityNames, type EntityOption, groupEntitiesByModule, withRenamedEntity } from "../../NameChanger/entityPicker";
import { fakeUnitInfo } from "../shared/helpers/fakes";

// The real package needs Studio Pro at runtime; only getContainer is used.
const { getContainer } = vi.hoisted(() => ({ getContainer: vi.fn() }));
vi.mock("@mendix/extensions-api", () => ({ getContainer }));

const entity = (name: string, domainModelId?: string) =>
  ({ $ID: `id-${name}`, name, container: domainModelId === undefined ? undefined : { $ID: domainModelId } }) as unknown as Mx.DomainModels.Entity;
const infos = [
  fakeUnitInfo("dm-1", "DomainModels$DomainModel", "Sales"),
  fakeUnitInfo("dm-2", "DomainModels$DomainModel", "hr"),
  { $ID: "dm-3", $Type: "DomainModels$DomainModel" } as Mx.Primitives.UnitInfo,
];

beforeEach(() => {
  getContainer.mockReset();
  getContainer.mockImplementation((e: { container?: { $ID: string } }) => e.container);
});

describe("groupEntitiesByModule", () => {
  it("groups by module, both sorted case-insensitively", () => {
    const byModule = groupEntitiesByModule([entity("Order", "dm-1"), entity("Employee", "dm-2"), entity("customer", "dm-1"), entity("Invoice", "dm-1")], infos);
    expect([...byModule.keys()]).toEqual(["hr", "Sales"]);
    expect(byModule.get("Sales")!.map((o) => o.name)).toEqual(["customer", "Invoice", "Order"]);
    expect(byModule.get("hr")).toEqual([{ id: "id-Employee", name: "Employee", moduleName: "hr", domainModelId: "dm-2" }]);
  });

  it("leaves out entities without a container or a known module", () => {
    const byModule = groupEntitiesByModule([entity("Order"), entity("Ghost", "dm-9"), entity("Nameless", "dm-3")], infos);
    expect(byModule.size).toBe(0);
  });

  it("returns an empty map without entities", () => {
    expect(groupEntitiesByModule([], infos).size).toBe(0);
  });
});

describe("withRenamedEntity", () => {
  const opt = (name: string, moduleName = "Sales"): EntityOption => ({ id: `id-${name}`, name, moduleName, domainModelId: `dm-${moduleName}` });

  it("renames the entity and sorts its module again, leaving the input and other modules as they are", () => {
    const other = [opt("Invoice", "Billing")];
    const byModule = new Map<string, readonly EntityOption[]>([
      ["Billing", other],
      ["Sales", [opt("Customer"), opt("Order")]],
    ]);
    const result = withRenamedEntity(byModule, "id-Order", "Basket");
    expect(result.get("Sales")).toEqual([{ ...opt("Order"), name: "Basket" }, opt("Customer")]);
    expect(result.get("Billing")).toBe(other);
    expect(byModule.get("Sales")!.map((o) => o.name)).toEqual(["Customer", "Order"]);
  });

  it("returns the same content for an unknown entity", () => {
    const byModule = new Map<string, readonly EntityOption[]>([["Sales", [opt("Order")]]]);
    expect(withRenamedEntity(byModule, "missing", "X")).toEqual(byModule);
  });
});

describe("allEntityNames", () => {
  it("lists every entity name, module by module", () => {
    const byModule = groupEntitiesByModule([entity("Order", "dm-1"), entity("Employee", "dm-2")], infos);
    expect(allEntityNames(byModule)).toEqual(["Employee", "Order"]);
  });
});
