import type { DomainModels, Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { fakeResolveAccess, fakeUnitInfo } from "../../helpers/fakes";
import { emptyFlowReferences, ReferenceCache } from "../../../../EntityNameChanger/updaters/microflows/ReferenceCache";
import { type DomainModelLookup, loadAssociationEnds, ReferenceResolver } from "../../../../EntityNameChanger/updaters/microflows/ReferenceResolver";

type Ends = { name: string; parent: string; child: string };

function fakeDomainModels(elements: Record<string, unknown>, models: { id: string; module: string; associations: Ends[]; crossAssociations?: Ends[] }[] = []) {
  const resolver = fakeResolveAccess(elements);
  const lookup = {
    ...resolver,
    resolve: resolver.resolve,
    loadAllCalls: 0,
    async getUnitsInfo(): Promise<Readonly<Primitives.UnitInfo>[]> {
      return models.map((m) => fakeUnitInfo(m.id, "DomainModels$DomainModel", m.module));
    },
    async loadAll(filter: (info: Primitives.UnitInfo) => boolean) {
      lookup.loadAllCalls++;
      return models
        .filter((m) => filter({ $ID: m.id, $Type: "DomainModels$DomainModel" } as Primitives.UnitInfo))
        .map((m) => ({ $ID: m.id, associations: m.associations, crossAssociations: m.crossAssociations ?? [] }) as unknown as DomainModels.DomainModel);
    },
  };
  return lookup;
}

function setup(options: { domainModels?: ReturnType<typeof fakeDomainModels>; elements?: Record<string, unknown> } = {}) {
  const elements = options.elements ?? {};
  const apis = {
    microflows: fakeResolveAccess(elements),
    domainModels: options.domainModels ?? fakeDomainModels({}),
    javaActions: fakeResolveAccess(elements),
    workflows: fakeResolveAccess(elements),
    consumedRestServices: fakeResolveAccess(elements),
    mlMappingDocuments: fakeResolveAccess(elements),
  };
  const cache = new ReferenceCache();
  return { apis, cache, resolver: new ReferenceResolver(apis, cache) };
}

describe("ReferenceResolver", () => {
  it("resolves microflow return entities once per qualified name", async () => {
    const { apis, cache, resolver } = setup({
      elements: {
        "Microflows$Microflow:M.Get": { microflowReturnType: { $Type: "DataTypes$ObjectType", entity: "M.Order" } },
        "Microflows$Microflow:M.Void": { microflowReturnType: { $Type: "DataTypes$VoidType" } },
      },
    });
    const refs = emptyFlowReferences();
    refs.microflows.add("M.Get").add("M.Void").add("M.Missing");
    await resolver.resolveAll(refs);
    await resolver.resolveAll(refs);
    expect(apis.microflows.calls).toHaveLength(3);
    expect([...cache.microflowReturnEntities]).toEqual([
      ["M.Get", "M.Order"],
      ["M.Void", null],
      ["M.Missing", null],
    ]);
  });

  it("caches null when resolve throws", async () => {
    const { cache, resolver } = setup({ elements: { "JavaActions$JavaAction:M.Broken": new Error("boom") } });
    const refs = emptyFlowReferences();
    refs.javaActions.add("M.Broken");
    await resolver.resolveAll(refs);
    expect(cache.javaActions.get("M.Broken")).toBeNull();
  });

  it("stores java action signatures, workflow and ml entities", async () => {
    const { cache, resolver } = setup({
      elements: {
        "JavaActions$JavaAction:M.Java": {
          actionReturnType: { $Type: "CodeActions$ConcreteEntityType", entity: "M.Order" },
          actionParameters: [],
        },
        "Workflows$Workflow:M.Flow": { parameter: { entity: "M.Order" } },
        "MLMappings$MLMappingDocument:M.Ml": { mlModelMappings: { output: { entity: "M.Prediction" } } },
      },
    });
    const refs = emptyFlowReferences();
    refs.javaActions.add("M.Java");
    refs.workflows.add("M.Flow").add("M.NoFlow");
    refs.mlMappings.add("M.Ml").add("M.NoMl");
    await resolver.resolveAll(refs);
    expect(cache.javaActions.get("M.Java")?.returnEntity).toBe("M.Order");
    expect(cache.workflowContextEntities.get("M.Flow")).toBe("M.Order");
    expect(cache.workflowContextEntities.get("M.NoFlow")).toBeNull();
    expect(cache.mlOutputEntities.get("M.Ml")).toBe("M.Prediction");
    expect(cache.mlOutputEntities.get("M.NoMl")).toBeNull();
  });

  it("resolves rest operations as <service>.<operation>", async () => {
    const operation = (name: string) => ({
      name,
      responseHandling: { $Type: "Rest$ImplicitMappingResponseHandling", rootMappingElement: { entity: "M.Order" } },
    });
    const { apis, cache, resolver } = setup({
      elements: { "Rest$ConsumedRestService:M.Api": { operations: [operation("GetOrders")] } },
    });
    const refs = emptyFlowReferences();
    refs.restOperations.add("M.Api.GetOrders").add("M.Api.Missing").add("NoDot").add("M.None.Op");
    await resolver.resolveAll(refs);
    expect(cache.restOperationEntities.get("M.Api.GetOrders")).toBe("M.Order");
    expect(cache.restOperationEntities.get("M.Api.Missing")).toBeNull();
    expect(cache.restOperationEntities.get("NoDot")).toBeNull();
    expect(cache.restOperationEntities.get("M.None.Op")).toBeNull();
    expect(apis.consumedRestServices.calls.map((c) => c.qualifiedName)).toEqual(["M.Api", "M.Api", "M.None"]);
  });

  it("resolves associations, then cross associations", async () => {
    const domainModels = fakeDomainModels({
      "DomainModels$Association:M.Order_Customer": { parent: "M.Order", child: "M.Customer" },
      "DomainModels$CrossAssociation:M.Order_Other": { parent: "M.Order", child: "O.Other" },
    });
    const { cache, resolver } = setup({ domainModels });
    const refs = emptyFlowReferences();
    refs.associations.add("M.Order_Customer").add("M.Order_Other");
    await resolver.resolveAll(refs);
    expect(cache.associations.get("M.Order_Customer")).toEqual({ parent: "M.Order", child: "M.Customer" });
    expect(cache.associations.get("M.Order_Other")).toEqual({ parent: "M.Order", child: "O.Other" });
    expect(domainModels.loadAllCalls).toBe(0);
  });

  it("falls back to loading all domain models once for unresolvable associations", async () => {
    const domainModels = fakeDomainModels({ "DomainModels$Association:M.Broken": new Error("not a unit") }, [
      { id: "dm-1", module: "M", associations: [{ name: "Order_Line", parent: "p1", child: "c1" }] },
      { id: "dm-2", module: "O", associations: [], crossAssociations: [{ name: "X_Order", parent: "p2", child: "c2" }] },
    ]);
    const { cache, resolver } = setup({ domainModels });
    const refs = emptyFlowReferences();
    refs.associations.add("M.Order_Line").add("O.X_Order").add("M.Broken");
    await resolver.resolveAll(refs);
    expect(domainModels.loadAllCalls).toBe(1);
    expect(cache.associations.get("M.Order_Line")).toEqual({ parent: "p1", child: "c1" });
    expect(cache.associations.get("O.X_Order")).toEqual({ parent: "p2", child: "c2" });
    expect(cache.associations.get("M.Broken")).toBeNull();
  });
});

describe("loadAssociationEnds", () => {
  it("keys associations by module-qualified name and skips domain models without a module", async () => {
    const lookup = fakeDomainModels({}, [{ id: "dm-1", module: "M", associations: [{ name: "A", parent: "p", child: "c" }] }]);
    // dm-2 is loaded but has no unit info.
    lookup.loadAll = async () =>
      [
        { $ID: "dm-1", associations: [{ name: "A", parent: "p", child: "c" }], crossAssociations: [] },
        { $ID: "dm-2", associations: [{ name: "B", parent: "p", child: "c" }], crossAssociations: [] },
      ] as unknown as DomainModels.DomainModel[];
    const ends = await loadAssociationEnds(lookup as DomainModelLookup);
    expect([...ends.keys()]).toEqual(["M.A"]);
  });
});
