import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import { NO_LOCAL_RENAMES } from "../../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import {
  type PublishedServiceDocument,
  PublishedServiceInspector,
} from "../../../../EntityNameChanger/updaters/documents/PublishedServiceInspector";
import { publishedOData, publishedRest, publishedWebService } from "../../helpers/documentBuilders";
import { fakeContext } from "../../helpers/fakes";

function setup(renameExposedNames: boolean) {
  const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"], renameExposedNames });
  const renames = QualifiedNameRenames.forEntity(context);
  const inspector = new PublishedServiceInspector(context, new NamingPolicy(context.oldName, context.newName, context.protectedNames), renames);
  return { inspector, renames };
}

const asDoc = (doc: unknown) => doc as PublishedServiceDocument;

describe("PublishedServiceInspector.usesEntity", () => {
  it("is true for a published entity, old or new name", () => {
    const { inspector } = setup(false);
    expect(inspector.usesEntity(asDoc(publishedOData("MyModule.Order")))).toBe(true);
    expect(inspector.usesEntity(asDoc(publishedOData("MyModule.Purchase")))).toBe(true);
    expect(inspector.usesEntity(asDoc(publishedWebService("MyModule.Order")))).toBe(true);
  });

  it("is true for a reference to a renamed document", () => {
    const { inspector, renames } = setup(false);
    const rest = asDoc(publishedRest("MyModule.ACT_Order_Get"));
    expect(inspector.usesEntity(rest)).toBe(false);
    renames.addDocument("MyModule", "ACT_Order_Get", "ACT_Purchase_Get");
    expect(inspector.usesEntity(rest)).toBe(true);
  });

  it("is false for other entities and quoted text", () => {
    const { inspector } = setup(false);
    expect(inspector.usesEntity(asDoc(publishedOData("MyModule.OrderLine")))).toBe(false);
    expect(inspector.usesEntity(asDoc({ ...publishedOData("MyModule.Customer"), description: "'MyModule.Order'" }))).toBe(false);
  });
});

describe("PublishedServiceInspector.apply", () => {
  it("has no local renames", () => {
    expect(setup(true).inspector.planLocalRenames()).toBe(NO_LOCAL_RENAMES);
  });

  it("keeps exposed names without the opt-in", () => {
    const { inspector } = setup(false);
    const service = publishedOData("MyModule.Order");
    expect(inspector.apply(asDoc(service), NO_LOCAL_RENAMES)).toBe(0);
    expect(service.entityTypes[0].exposedName).toBe("Order");
    expect(inspector.exposedNameCounts()).toEqual({ renamed: 0, skipped: 0 });
  });

  it("renames OData exposed names with the opt-in, protected names, paths and namespaces kept", () => {
    const { inspector } = setup(true);
    const service = publishedOData("MyModule.Order");
    expect(inspector.apply(asDoc(service), NO_LOCAL_RENAMES)).toBe(3);
    expect(service.entityTypes[0].exposedName).toBe("Purchase");
    expect(service.entityTypes[0].childMembers[0].exposedAssociationName).toBe("Purchase_Customer");
    expect(service.entitySets[0].exposedName).toBe("Purchases");
    expect(service.entityTypes[1].exposedName).toBe("OrderLine");
    expect(service.path).toBe("odata/Order/v1");
    expect(service.namespace).toBe("Order");
    expect(inspector.exposedNameCounts()).toEqual({ renamed: 3, skipped: 0 });
  });

  it("renames REST resource, service and operation parameter names with their path placeholders", () => {
    const { inspector } = setup(true);
    const service = publishedRest("MyModule.Order");
    const operation = service.resources[0].operations[0];
    operation.path = "Orders/{Order}/{OrderLine}";
    operation.parameters.push({ $Type: "Rest$RestOperationParameter", name: "OrderLine", type: { $Type: "DataTypes$StringType" } });
    expect(inspector.apply(asDoc(service), NO_LOCAL_RENAMES)).toBe(3);
    expect(service.serviceName).toBe("PurchaseService");
    expect(service.resources[0].name).toBe("Purchase");
    expect(operation.parameters.map((p) => p.name)).toEqual(["Purchase", "OrderLine"]);
    expect(operation.path).toBe("Orders/{Purchase}/{OrderLine}");
    expect(service.path).toBe("rest/order/v1");
    expect(inspector.exposedNameCounts()).toEqual({ renamed: 3, skipped: 0 });
  });

  it("skips an operation parameter whose new name is taken, keeping its placeholder", () => {
    const { inspector } = setup(true);
    const service = publishedRest("MyModule.Order");
    const operation = service.resources[0].operations[0];
    operation.parameters.push({ $Type: "Rest$RestOperationParameter", name: "Purchase", type: { $Type: "DataTypes$StringType" } });
    inspector.apply(asDoc(service), NO_LOCAL_RENAMES);
    expect(operation.parameters[0].name).toBe("Order");
    expect(operation.path).toBe("{Order}");
    expect(inspector.exposedNameCounts()).toEqual({ renamed: 2, skipped: 1 });
  });

  it("keeps REST parameter names and paths without the opt-in", () => {
    const { inspector } = setup(false);
    const service = publishedRest("MyModule.Order");
    inspector.apply(asDoc(service), NO_LOCAL_RENAMES);
    expect(service.resources[0].operations[0].parameters[0].name).toBe("Order");
    expect(service.resources[0].operations[0].path).toBe("{Order}");
  });

  it("renames web service operation and data entity exposed names", () => {
    const { inspector } = setup(true);
    const service = publishedWebService("MyModule.Order");
    const operation = service.versionedServices[0].operations[0];
    expect(inspector.apply(asDoc(service), NO_LOCAL_RENAMES)).toBe(3);
    expect(operation.name).toBe("GetPurchase");
    expect(operation.entityExposedName).toBe("Purchase");
    expect(operation.dataEntity.exposedName).toBe("Purchase");
  });

  it("skips a new exposed name already used by the same property", () => {
    const { inspector } = setup(true);
    const service = publishedOData("MyModule.Order");
    service.entitySets.push({ $Type: "ODataPublish$EntitySet", entityType: "MyModule.Customer", exposedName: "Purchases" });
    inspector.apply(asDoc(service), NO_LOCAL_RENAMES);
    expect(service.entitySets[0].exposedName).toBe("Orders");
    expect(inspector.exposedNameCounts()).toEqual({ renamed: 2, skipped: 1 });
  });

  it("changes nothing in a service that does not use the entity", () => {
    const { inspector } = setup(true);
    const service = { ...publishedOData("MyModule.Customer"), name: "POS_Order" };
    service.entityTypes[0].exposedName = "Order";
    expect(inspector.apply(asDoc(service), NO_LOCAL_RENAMES)).toBe(0);
    expect(service.entityTypes[0].exposedName).toBe("Order");
  });
});
