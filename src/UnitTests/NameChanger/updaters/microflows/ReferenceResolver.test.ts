import type { DomainModels, Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { fakeResolveAccess } from "../../helpers/fakes";
import { fakeUnitInfo } from "../../../shared/helpers/fakes";
import { emptyFlowReferences, ReferenceCache } from "../../../../NameChanger/updaters/microflows/ReferenceCache";
import { type DomainModelLookup, loadAssociationEnds, ReferenceResolver } from "../../../../NameChanger/updaters/microflows/ReferenceResolver";

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

function setup(
  options: { domainModels?: ReturnType<typeof fakeDomainModels>; elements?: Record<string, unknown> } = {},
) {
  const elements = options.elements ?? {};
  const apis = {
    microflows: fakeResolveAccess(elements),
    nanoflows: fakeResolveAccess(elements),
    domainModels: options.domainModels ?? fakeDomainModels({}),
    javaActions: fakeResolveAccess(elements),
    javaScriptActions: fakeResolveAccess(elements),
    workflows: fakeResolveAccess(elements),
    consumedRestServices: fakeResolveAccess(elements),
    mlMappingDocuments: fakeResolveAccess(elements),
    databaseConnections: fakeResolveAccess(elements),
    excelDataImporterTemplates: fakeResolveAccess(elements),
    connectorTypes: fakeResolveAccess(elements),
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

  it("resolves nanoflow return entities", async () => {
    const { apis, cache, resolver } = setup({
      elements: { "Microflows$Nanoflow:M.Get": { microflowReturnType: { $Type: "DataTypes$ListType", entity: "M.Order" } } },
    });
    const refs = emptyFlowReferences();
    refs.nanoflows.add("M.Get").add("M.Missing");
    await resolver.resolveAll(refs);
    await resolver.resolveAll(refs);
    expect(apis.nanoflows.calls).toHaveLength(2);
    expect([...cache.nanoflowReturnEntities]).toEqual([
      ["M.Get", "M.Order"],
      ["M.Missing", null],
    ]);
  });

  // Regression: resolving runs before anything is renamed, so a flow planned for a rename is found by its old name.
  it("resolves flows by the name the caller writes", async () => {
    const { apis, cache, resolver } = setup({
      elements: {
        "Microflows$Microflow:M.GET_Order": { microflowReturnType: { $Type: "DataTypes$ObjectType", entity: "M.Order" } },
        "Microflows$Nanoflow:M.NF_Order": { microflowReturnType: { $Type: "DataTypes$ObjectType", entity: "M.Order" } },
      },
    });
    const refs = emptyFlowReferences();
    refs.microflows.add("M.GET_Order");
    refs.nanoflows.add("M.NF_Order");
    await resolver.resolveAll(refs);
    expect(apis.microflows.calls.map((c) => c.qualifiedName)).toEqual(["M.GET_Order"]);
    expect(apis.nanoflows.calls.map((c) => c.qualifiedName)).toEqual(["M.NF_Order"]);
    expect(cache.microflowReturnEntities.get("M.GET_Order")).toBe("M.Order");
    expect(cache.nanoflowReturnEntities.get("M.NF_Order")).toBe("M.Order");
  });

  it("remembers flows, actions and workflows loaded in the plan, so callers need no resolve", async () => {
    const { apis, cache, resolver } = setup();
    const info = (type: string, name: string) => fakeUnitInfo(name, type, "M", name);
    resolver.remember(
      { $ID: "mf", $Type: "Microflows$Microflow", microflowReturnType: { $Type: "DataTypes$ListType", entity: "M.Order" } } as never,
      info("Microflows$Microflow", "GET_Orders"),
    );
    resolver.remember(
      { $ID: "nf", $Type: "Microflows$Nanoflow", microflowReturnType: { $Type: "DataTypes$VoidType" } } as never,
      info("Microflows$Nanoflow", "NF_Void"),
    );
    resolver.remember(
      { $ID: "ja", $Type: "JavaActions$JavaAction", actionReturnType: { $Type: "CodeActions$ConcreteEntityType", entity: "M.Order" }, actionParameters: [] } as never,
      info("JavaActions$JavaAction", "JA_Get"),
    );
    resolver.remember(
      { $ID: "js", $Type: "JavaScriptActions$JavaScriptAction", actionReturnType: { $Type: "CodeActions$VoidType" }, actionParameters: [] } as never,
      info("JavaScriptActions$JavaScriptAction", "JS_Do"),
    );
    resolver.remember({ $ID: "wf", $Type: "Workflows$Workflow", parameter: { entity: "M.Order" } } as never, info("Workflows$Workflow", "WF_Order"));
    resolver.remember({ $ID: "p", $Type: "Pages$Page" } as never, info("Pages$Page", "Page"));
    const refs = emptyFlowReferences();
    refs.microflows.add("M.GET_Orders");
    refs.nanoflows.add("M.NF_Void");
    refs.javaActions.add("M.JA_Get");
    refs.javaScriptActions.add("M.JS_Do");
    refs.workflows.add("M.WF_Order");
    await resolver.resolveAll(refs);
    expect([apis.microflows, apis.nanoflows, apis.javaActions, apis.javaScriptActions, apis.workflows].map((a) => a.calls.length)).toEqual([0, 0, 0, 0, 0]);
    expect(cache.microflowReturnEntities.get("M.GET_Orders")).toBe("M.Order");
    expect(cache.nanoflowReturnEntities.get("M.NF_Void")).toBeNull();
    expect(cache.javaActions.get("M.JA_Get")?.returnEntity).toBe("M.Order");
    expect(cache.javaScriptActions.get("M.JS_Do")?.returnEntity).toBeNull();
    expect(cache.workflowContextEntities.get("M.WF_Order")).toBe("M.Order");
  });

  it("never overwrites a cached value and skips units without a module", () => {
    const { cache, resolver } = setup();
    cache.microflowReturnEntities.set("M.GET", "M.Resolved");
    const flow = { $ID: "mf", $Type: "Microflows$Microflow", microflowReturnType: { $Type: "DataTypes$ObjectType", entity: "M.Other" } } as never;
    resolver.remember(flow, fakeUnitInfo("mf", "Microflows$Microflow", "M", "GET"));
    resolver.remember(flow, { $ID: "x", $Type: "Microflows$Microflow", name: "NoModule" } as never);
    expect([...cache.microflowReturnEntities]).toEqual([["M.GET", "M.Resolved"]]);
  });

  it("stores JavaScript action signatures", async () => {
    const { cache, resolver } = setup({
      elements: {
        "JavaScriptActions$JavaScriptAction:M.Js": {
          actionReturnType: { $Type: "CodeActions$ConcreteEntityType", entity: "M.Order" },
          actionParameters: [],
        },
      },
    });
    const refs = emptyFlowReferences();
    refs.javaScriptActions.add("M.Js").add("M.Missing");
    await resolver.resolveAll(refs);
    expect(cache.javaScriptActions.get("M.Js")).toEqual({ returnEntity: "M.Order", returnTypeParameter: null, parameters: [] });
    expect(cache.javaScriptActions.get("M.Missing")).toBeNull();
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

  it("resolves database queries as <connection>.<query>, once", async () => {
    const { apis, cache, resolver } = setup({
      elements: {
        "DatabaseConnector$DatabaseConnection:M.Db": { queries: [{ name: "GetOrders", tableMappings: [{ entity: "M.Order" }] }] },
      },
    });
    const refs = emptyFlowReferences();
    refs.databaseQueries.add("M.Db.GetOrders").add("M.Db.Missing").add("NoDot").add("M.None.Query");
    await resolver.resolveAll(refs);
    await resolver.resolveAll(refs);
    expect([...cache.databaseQueryEntities]).toEqual([
      ["M.Db.GetOrders", "M.Order"],
      ["M.Db.Missing", null],
      ["NoDot", null],
      ["M.None.Query", null],
    ]);
    expect(apis.databaseConnections.calls).toHaveLength(3);
  });

  it("resolves Excel importer templates", async () => {
    const { cache, resolver } = setup({
      elements: {
        "ExcelDataImporter$Template:M.Import": { contents: { $Type: "ExcelDataImporter$CSVTemplateContents", sheet: { entity: "M.Order" } } },
        "ExcelDataImporter$Template:M.Broken": new Error("boom"),
      },
    });
    const refs = emptyFlowReferences();
    refs.excelTemplates.add("M.Import").add("M.Broken").add("M.Missing");
    await resolver.resolveAll(refs);
    expect([...cache.excelTemplateEntities]).toEqual([
      ["M.Import", "M.Order"],
      ["M.Broken", null],
      ["M.Missing", null],
    ]);
  });

  it("resolves connector actions through their Java action's return entity", async () => {
    const { cache, resolver } = setup({
      elements: {
        "ConnectorKit$ConnectorType:M.Crm": {
          connectorActions: [
            { name: "GetOrder", javaAction: "M.JA_GetOrder" },
            { name: "NoJava", javaAction: null },
          ],
        },
        "JavaActions$JavaAction:M.JA_GetOrder": {
          actionReturnType: { $Type: "CodeActions$ListType", parameter: { $Type: "CodeActions$ConcreteEntityType", entity: "M.Order" } },
          actionParameters: [],
        },
      },
    });
    const refs = emptyFlowReferences();
    refs.connectorActions.add("M.Crm.GetOrder").add("M.Crm.NoJava").add("M.Crm.Missing").add("NoDot");
    await resolver.resolveAll(refs);
    expect([...cache.connectorActionEntities]).toEqual([
      ["M.Crm.GetOrder", "M.Order"],
      ["M.Crm.NoJava", null],
      ["M.Crm.Missing", null],
      ["NoDot", null],
    ]);
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
