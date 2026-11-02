import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { AssociationRenamePlan } from "../../../EntityNameChanger/framework/AssociationRenamePlan";
import { DocumentNameRegistry } from "../../../EntityNameChanger/framework/DocumentNameRegistry";
import { MessageDefinitionUsage } from "../../../EntityNameChanger/framework/MessageDefinitionUsage";
import { QualifiedNameRenames } from "../../../EntityNameChanger/framework/QualifiedNameRenames";
import { fakeContext, fakeUnitInfo } from "../helpers/fakes";
import { AssociationUpdater } from "../../../EntityNameChanger/updaters/domainModels/AssociationUpdater";
import { DocumentUpdater } from "../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import { FlowUpdater } from "../../../EntityNameChanger/updaters/microflows/FlowUpdater";
import { PageUpdater } from "../../../EntityNameChanger/updaters/pages/PageUpdater";
import { ReferenceUpdater } from "../../../EntityNameChanger/updaters/references/ReferenceUpdater";
import { RefreshUpdater } from "../../../EntityNameChanger/updaters/refresh/RefreshUpdater";
import {
  type AppModel,
  createUpdaters,
  EXCLUDED_DOCUMENT_TYPES,
  REFERENCE_DOCUMENT_TYPES,
} from "../../../EntityNameChanger/updaters/updaterRegistry";

// Every model API the registry passes on; each is a distinct marker object.
const API_NAMES = [
  "microflows",
  "nanoflows",
  "rules",
  "pages",
  "snippets",
  "layouts",
  "menuDocuments",
  "workflows",
  "importMappings",
  "exportMappings",
  "jsonStructures",
  "messageDefinitions",
  "messageDefinitions2",
  "javaActions",
  "javaScriptActions",
  "documentTemplates",
  "dataSets",
  "domainModels",
  "scheduledEvents",
  "publishedRestServices",
  "publishedODataServices2",
  "publishedWebServices",
  "consumedRestServices",
  "consumedODataServices",
  "mlMappingDocuments",
  "viewEntitySourceDocuments",
  "connectorTypes",
  "databaseConnections",
  "excelDataImporterTemplates",
  "businessEventServices",
  "entityChangeDataCaptureServices",
];
const model = Object.fromEntries(API_NAMES.map((name) => [name, { api: name }])) as unknown as AppModel;

const PLAN_LABELS = [
  "Microflows (plan)",
  "Nanoflows (plan)",
  "Rules (plan)",
  "Pages (plan)",
  "Snippets (plan)",
  "Workflows (plan)",
  "Import mappings (plan)",
  "Export mappings (plan)",
  "JSON structures (plan)",
  "Message definitions (plan)",
  "Message definition documents (plan)",
  "Datasets (plan)",
  "View entity source documents (plan)",
  "Java actions (plan)",
  "JavaScript actions (plan)",
  "Published REST services (plan)",
  "Published OData services (plan)",
  "Published web services (plan)",
  "Associations (plan)",
];

const RENAME_LABELS = [
  "Associations",
  "Microflows",
  "Nanoflows",
  "Rules",
  "Pages",
  "Snippets",
  "Workflows",
  "Import mappings",
  "Export mappings",
  "JSON structures",
  "Message definitions",
  "Message definition documents",
  "Datasets",
  "View entity source documents",
  "Java actions",
  "JavaScript actions",
  "Published REST services",
  "Published OData services",
  "Published web services",
];

const REFERENCE_LABELS = [
  "References in view entity source documents",
  "References in domain models",
  "References in Java actions",
  "References in JavaScript actions",
  "References in connector types",
  "References in consumed REST services",
  "References in consumed OData services",
  "References in ML model mappings",
  "References in database connections",
  "References in Excel importer templates",
  "References in microflows",
  "References in nanoflows",
  "References in rules",
  "References in pages",
  "References in snippets",
  "References in layouts",
  "References in menus",
  "References in workflows",
  "References in import mappings",
  "References in export mappings",
  "References in message definitions",
  "References in message definition documents",
  "References in datasets",
  "References in scheduled events",
  "References in published REST services",
  "References in published OData services",
  "References in published web services",
  "References in business event services",
  "References in change data capture services",
];

const REFRESH_LABELS = ["Refresh pages", "Refresh snippets"];

const context = fakeContext();

function create(
  renames = QualifiedNameRenames.forEntity(context),
  associationPlan = new AssociationRenamePlan(),
  messageDefinitionUsage = new MessageDefinitionUsage(),
) {
  return createUpdaters(model, {
    context,
    documentNames: new DocumentNameRegistry(),
    renames,
    associationPlan,
    messageDefinitionUsage,
  });
}

const all = (groups = create()) => [...groups.planners, ...groups.renamers, ...groups.referenceUpdaters, ...groups.refreshers];
const byLabel = (label: string, groups = create()) => all(groups).find((u) => u.label === label)!;

function flowWithOrderParameter(name: string): Primitives.UnitBase {
  return {
    $Type: "Microflows$Microflow",
    name,
    objectCollection: {
      objects: [
        {
          $Type: "Microflows$MicroflowParameterObject",
          $ID: "p1",
          name: "Order",
          defaultValue: null,
          variableType: { $Type: "DataTypes$ObjectType", entity: "MyModule.Order" },
        },
      ],
    },
    flows: [],
    parameters: [{ name: "Order" }],
    microflowReturnType: { $Type: "DataTypes$VoidType" },
    returnVariableName: "",
  } as unknown as Primitives.UnitBase;
}

describe("createUpdaters", () => {
  it("returns planners, renamers, reference updaters and refreshers", () => {
    const groups = create();
    expect(groups.planners.map((u) => u.label)).toEqual(PLAN_LABELS);
    expect(groups.renamers.map((u) => u.label)).toEqual(RENAME_LABELS);
    expect(groups.referenceUpdaters.map((u) => u.label)).toEqual(REFERENCE_LABELS);
    expect(groups.refreshers.map((u) => u.label)).toEqual(REFRESH_LABELS);
  });

  it("titles the plan steps", () => {
    const titles = all().map((u) => u.title).filter((t) => t !== undefined);
    expect(titles).toEqual([
      "Planning microflows",
      "Planning nanoflows",
      "Planning rules",
      "Planning pages",
      "Planning snippets",
      "Planning workflows",
      "Planning import mappings",
      "Planning export mappings",
      "Planning JSON structures",
      "Planning message definitions",
      "Planning message definition documents",
      "Planning datasets",
      "Planning view entity source documents",
      "Planning Java actions",
      "Planning JavaScript actions",
      "Planning published REST services",
      "Planning published OData services",
      "Planning published web services",
      "Planning associations",
      "Refreshing pages",
      "Refreshing snippets",
    ]);
  });

  it("implements every updater; no stubs are left", () => {
    expect(all().filter((u) => u.implemented).map((u) => u.label)).toEqual([...PLAN_LABELS, ...RENAME_LABELS, ...REFERENCE_LABELS, ...REFRESH_LABELS]);
  });

  it("passes the matching model api and unit type to the flow and page updaters", () => {
    const groups = create();
    for (const [label, type, api] of [
      ["Microflows", "Microflows$Microflow", "microflows"],
      ["Nanoflows", "Microflows$Nanoflow", "nanoflows"],
      ["Rules", "Microflows$Rule", "rules"],
    ] as const) {
      for (const suffix of ["", " (plan)"]) {
        expect(byLabel(label + suffix, groups)).toBeInstanceOf(FlowUpdater);
        expect(byLabel(label + suffix, groups).access).toBe(model[api]);
        expect(byLabel(label + suffix, groups).unitType).toBe(type);
      }
    }
    for (const [label, type, api] of [
      ["Pages", "Pages$Page", "pages"],
      ["Snippets", "Pages$Snippet", "snippets"],
    ] as const) {
      for (const suffix of ["", " (plan)"]) {
        expect(byLabel(label + suffix, groups)).toBeInstanceOf(PageUpdater);
        expect(byLabel(label + suffix, groups).access).toBe(model[api]);
        expect(byLabel(label + suffix, groups).unitType).toBe(type);
      }
    }
    for (const [label, type, api] of [
      ["Workflows", "Workflows$Workflow", "workflows"],
      ["Import mappings", "ImportMappings$ImportMapping", "importMappings"],
      ["Export mappings", "ExportMappings$ExportMapping", "exportMappings"],
      ["JSON structures", "JsonStructures$JsonStructure", "jsonStructures"],
      ["Message definitions", "MessageDefinitions$MessageDefinitionCollection", "messageDefinitions"],
      ["Message definition documents", "MessageDefinitions$MessageDefinition2", "messageDefinitions2"],
      ["Datasets", "DataSets$DataSet", "dataSets"],
      ["Java actions", "JavaActions$JavaAction", "javaActions"],
      ["JavaScript actions", "JavaScriptActions$JavaScriptAction", "javaScriptActions"],
      ["Published REST services", "Rest$PublishedRestService", "publishedRestServices"],
      ["Published OData services", "ODataPublish$PublishedODataService2", "publishedODataServices2"],
      ["Published web services", "WebServices$PublishedWebService", "publishedWebServices"],
    ] as const) {
      for (const suffix of ["", " (plan)"]) {
        expect(byLabel(label + suffix, groups)).toBeInstanceOf(DocumentUpdater);
        expect(byLabel(label + suffix, groups).access).toBe(model[api]);
        expect(byLabel(label + suffix, groups).unitType).toBe(type);
      }
    }
    expect(byLabel("Associations", groups).access).toBe(model.domainModels);
  });

  it("updates references in view entity queries, domain models, then Java/JavaScript actions, consumed services and ML mappings, before flows and pages", () => {
    const labels = create().referenceUpdaters.map((u) => u.label);
    expect(labels.slice(0, 10)).toEqual([
      "References in view entity source documents",
      "References in domain models",
      "References in Java actions",
      "References in JavaScript actions",
      "References in connector types",
      "References in consumed REST services",
      "References in consumed OData services",
      "References in ML model mappings",
      "References in database connections",
      "References in Excel importer templates",
    ]);
    expect(labels.indexOf("References in Excel importer templates")).toBeLessThan(labels.indexOf("References in import mappings"));
    expect(labels.indexOf("References in ML model mappings")).toBeLessThan(labels.indexOf("References in microflows"));
    expect(labels.indexOf("References in domain models")).toBeLessThan(labels.indexOf("References in pages"));
  });

  it("passes the matching model api and unit type to each reference updater", () => {
    const groups = create();
    for (const type of REFERENCE_DOCUMENT_TYPES) {
      const updater = byLabel(`References in ${type.documents}`, groups);
      expect(updater).toBeInstanceOf(ReferenceUpdater);
      expect(updater.access).toBe(model[type.api]);
      expect(updater.unitType).toBe(type.unitType);
      expect((updater as ReferenceUpdater).onlyProperties).toBe(type.onlyProperties);
    }
    expect(byLabel("References in message definitions", groups).access).toBe(model.messageDefinitions);
    expect(byLabel("References in microflows", groups)).toMatchObject({ onlyProperties: undefined });
  });

  it("refreshes pages and snippets with their model api", () => {
    const groups = create();
    expect(groups.refreshers.every((u) => u instanceof RefreshUpdater)).toBe(true);
    expect(byLabel("Refresh pages", groups)).toMatchObject({ access: model.pages, unitType: "Pages$Page" });
    expect(byLabel("Refresh snippets", groups)).toMatchObject({ access: model.snippets, unitType: "Pages$Snippet" });
  });

  it("shares the rename map and plan between the phases", async () => {
    const groups = create();
    const flow = flowWithOrderParameter("ACT_Order");
    const flowInfo = fakeUnitInfo("mf", "Microflows$Microflow", "MyModule", "ACT_Order");
    await byLabel("Microflows (plan)", groups).update(flow, flowInfo);
    expect((flow as unknown as { name: string }).name).toBe("ACT_Order");

    expect(await byLabel("Microflows", groups).update(flow, flowInfo)).toMatchObject({ changed: true, renamedTo: "ACT_Purchase", renamedVariables: 1 });

    const entityRef = { $Type: "DomainModels$DirectEntityRef", entity: "MyModule.Order" };
    const call = { $Type: "Pages$MicroflowSettings", microflow: "MyModule.ACT_Order" };
    const page = { $Type: "Pages$Page", name: "Customer_Edit", parameters: [], variables: [], widgets: [entityRef, call] } as unknown as Primitives.UnitBase;
    expect(await byLabel("References in pages", groups).update(page, fakeUnitInfo("p", "Pages$Page", "MyModule", "Customer_Edit"))).toMatchObject({ changed: true, updatedReferences: 2 });
    expect(entityRef.entity).toBe("MyModule.Purchase");
    expect(call.microflow).toBe("MyModule.ACT_Purchase");
  });

  it("updates references in every domain model, the entity's own included", async () => {
    const references = byLabel("References in domain models");
    const own = { $Type: "DomainModels$DomainModel", handler: { $Type: "DomainModels$EventHandler", microflow: "MyModule.Order_Handler" }, generalization: "MyModule.Order" };
    expect((await references.update(own as unknown as Primitives.UnitBase, fakeUnitInfo(context.domainModelId, "DomainModels$DomainModel", "MyModule"))).changed).toBe(true);
    expect(own.generalization).toBe("MyModule.Purchase");
    const other = { $Type: "DomainModels$DomainModel", child: "MyModule.Order" };
    expect((await references.update(other as unknown as Primitives.UnitBase, fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Invoicing"))).changed).toBe(true);
    expect(other.child).toBe("MyModule.Purchase");
  });

  it("uses the rename map it is given", async () => {
    const renames = QualifiedNameRenames.forEntity(context);
    const groups = create(renames);
    renames.addDocument("MyModule", "ACT_Order", "ACT_Purchase");
    const event = { $Type: "ScheduledEvents$ScheduledEvent", microflow: "MyModule.ACT_Order" };
    await byLabel("References in scheduled events", groups).update(event as unknown as Primitives.UnitBase, fakeUnitInfo("se", "ScheduledEvents$ScheduledEvent", "MyModule"));
    expect(event.microflow).toBe("MyModule.ACT_Purchase");
  });

  it("plans associations last and renames them first, with the shared plans", async () => {
    const associationPlan = new AssociationRenamePlan();
    const renames = QualifiedNameRenames.forEntity(context);
    const groups = create(renames, associationPlan);
    expect(groups.planners.at(-1)).toBeInstanceOf(AssociationUpdater);
    expect(groups.renamers[0]).toBeInstanceOf(AssociationUpdater);
    expect(byLabel("Associations (plan)", groups).access).toBe(model.domainModels);
    const association = { $Type: "DomainModels$CrossAssociation", $ID: "a1", name: "Invoice_Order", parent: "Other.Invoice", child: "MyModule.Order" };
    const other = { $Type: "DomainModels$DomainModel", $ID: "dm-2", entities: [], associations: [], crossAssociations: [association] } as unknown as Primitives.UnitBase;
    const info = fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Other");
    await byLabel("Associations (plan)", groups).update(other, info);
    expect(association.name).toBe("Invoice_Order");
    expect(associationPlan.get("dm-2")).toEqual(new Map([["a1", "Invoice_Purchase"]]));
    expect(renames.map.get("Other.Invoice_Order")).toBe("Other.Invoice_Purchase");
    expect(await byLabel("Associations", groups).update(other, info)).toMatchObject({ changed: true, renamedAssociations: 1 });
    expect(association.name).toBe("Invoice_Purchase");
  });

  it("documents the excluded types with a reason", () => {
    expect(EXCLUDED_DOCUMENT_TYPES.every((e) => e.label.length > 0 && e.reason.length > 0)).toBe(true);
  });

  it("never touches document templates", () => {
    expect(all().some((u) => u.unitType === "DocumentTemplates$DocumentTemplate" || u.access === model.documentTemplates)).toBe(false);
    expect(REFERENCE_DOCUMENT_TYPES.some((t) => t.api === "documentTemplates")).toBe(false);
    expect(EXCLUDED_DOCUMENT_TYPES.map((e) => e.label)).toContain("Document templates");
  });

  it("renames a Java action and its parameter, and rewrites callers and its types", async () => {
    const groups = create();
    const parameter = {
      $Type: "JavaActions$JavaActionParameter",
      name: "Order",
      actionParameterType: { $Type: "CodeActions$BasicParameterType", type: { $Type: "CodeActions$ConcreteEntityType", entity: "MyModule.Order" } },
    };
    const action = {
      $Type: "JavaActions$JavaAction",
      name: "JA_Order_Send",
      actionParameters: [parameter],
      actionReturnType: { $Type: "CodeActions$VoidType" },
    } as unknown as Primitives.UnitBase;
    const info = fakeUnitInfo("ja", "JavaActions$JavaAction", "MyModule", "JA_Order_Send");
    await byLabel("Java actions (plan)", groups).update(action, info);
    expect(await byLabel("Java actions", groups).update(action, info)).toMatchObject({ changed: true, renamedTo: "JA_Purchase_Send", renamedVariables: 1 });
    expect(parameter.name).toBe("Purchase");

    expect(await byLabel("References in Java actions", groups).update(action, info)).toMatchObject({ updatedReferences: 1 });
    expect(parameter.actionParameterType.type.entity).toBe("MyModule.Purchase");

    const mapping = { $Type: "Microflows$JavaActionParameterMapping", parameter: "MyModule.JA_Order_Send.Order" };
    const call = { $Type: "Microflows$JavaActionCallAction", javaAction: "MyModule.JA_Order_Send", parameterMappings: [mapping] };
    const flow = { $Type: "Microflows$Microflow", name: "ACT_Send", objectCollection: { objects: [call] } } as unknown as Primitives.UnitBase;
    await byLabel("References in microflows", groups).update(flow, fakeUnitInfo("mf", "Microflows$Microflow", "MyModule", "ACT_Send"));
    expect(call.javaAction).toBe("MyModule.JA_Purchase_Send");
    expect(mapping.parameter).toBe("MyModule.JA_Purchase_Send.Purchase");
  });

  it("renames a definition in a message definition collection and rewrites mapping references", async () => {
    const groups = create();
    const definition = {
      $Type: "MessageDefinitions$EntityMessageDefinition",
      name: "Order",
      exposedEntity: { $Type: "MessageDefinitions$ExposedEntity", entity: "MyModule.Order", exposedName: "Order", children: [] },
    };
    const collection = { $Type: "MessageDefinitions$MessageDefinitionCollection", name: "MD_Messages", messageDefinitions: [definition] } as unknown as Primitives.UnitBase;
    const info = fakeUnitInfo("mdc", "MessageDefinitions$MessageDefinitionCollection", "MyModule", "MD_Messages");
    await byLabel("Message definitions (plan)", groups).update(collection, info);
    expect(await byLabel("Message definitions", groups).update(collection, info)).toMatchObject({ changed: true, renamedTo: null, renamedVariables: 1 });
    expect(definition.name).toBe("Purchase");
    const mapping = { $Type: "ImportMappings$ImportMapping", name: "IMM", messageDefinition: "MyModule.MD_Messages.Order" } as unknown as Primitives.UnitBase;
    await byLabel("References in import mappings", groups).update(mapping, fakeUnitInfo("imm", "ImportMappings$ImportMapping", "MyModule", "IMM"));
    expect((mapping as unknown as { messageDefinition: string }).messageDefinition).toBe("MyModule.MD_Messages.Purchase");
  });

  it("rewrites only mapping references in a consumed REST service, not its API text", async () => {
    const renames = QualifiedNameRenames.forEntity(context);
    const groups = create(renames);
    renames.addDocument("MyModule", "ACT_Order_Map", "ACT_Purchase_Map");
    const root = {
      $Type: "ImportMappings$ImportObjectMappingElement",
      entity: "MyModule.Order",
      association: null,
      mappingMicroflowCall: { $Type: "ImportMappings$MappingMicroflowCall", microflow: "MyModule.ACT_Order_Map", parameterMappings: [] },
      children: [],
    };
    const service = {
      $Type: "Rest$ConsumedRestService",
      name: "CRS_Orders",
      openApiFile: { $Type: "Rest$OpenApiFile", content: '{"ref": "MyModule.Order"}' },
      operations: [{ $Type: "Rest$RestOperation", name: "GetOrder", responseHandling: { $Type: "Rest$ImplicitMappingResponseHandling", rootMappingElement: root } }],
    };
    const result = await byLabel("References in consumed REST services", groups).update(
      service as unknown as Primitives.UnitBase,
      fakeUnitInfo("crs", "Rest$ConsumedRestService", "MyModule", "CRS_Orders"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 2 });
    expect(root.entity).toBe("MyModule.Purchase");
    expect(root.mappingMicroflowCall.microflow).toBe("MyModule.ACT_Purchase_Map");
    expect(service.openApiFile.content).toBe('{"ref": "MyModule.Order"}');
  });

  it("renames only the renamed view entity's own source document", async () => {
    const groups = create();
    const own = { $Type: "DomainModels$ViewEntitySourceDocument", name: "Order", oql: "SELECT 1" } as unknown as Primitives.UnitBase & { name: string };
    const other = { $Type: "DomainModels$ViewEntitySourceDocument", name: "OrderOverview", oql: "FROM MyModule.Order" } as unknown as Primitives.UnitBase & { name: string };
    const ownInfo = fakeUnitInfo("v1", "DomainModels$ViewEntitySourceDocument", "MyModule", "Order");
    const otherInfo = fakeUnitInfo("v2", "DomainModels$ViewEntitySourceDocument", "MyModule", "OrderOverview");
    await byLabel("View entity source documents (plan)", groups).update(own, ownInfo);
    await byLabel("View entity source documents (plan)", groups).update(other, otherInfo);
    expect(await byLabel("View entity source documents", groups).update(own, ownInfo)).toMatchObject({ changed: true, renamedTo: "Purchase" });
    expect(await byLabel("View entity source documents", groups).update(other, otherInfo)).toMatchObject({ changed: false, renamedTo: null });
    expect([own.name, other.name]).toEqual(["Purchase", "OrderOverview"]);
  });

  it("rewrites the entity and its associations in view entity queries, not literals or other entities", async () => {
    const renames = QualifiedNameRenames.forEntity(context);
    renames.addDocument("MyModule", "Order_Customer", "Purchase_Customer");
    const groups = create(renames);
    const document = {
      $Type: "DomainModels$ViewEntitySourceDocument",
      name: "OrderOverview",
      oql: "SELECT o.Total AS Total FROM MyModule.Order AS o JOIN o/MyModule.Order_Customer/MyModule.Customer AS c JOIN MyModule.OrderLine AS l WHERE c.Name = 'MyModule.Order'",
    };
    const result = await byLabel("References in view entity source documents", groups).update(
      document as unknown as Primitives.UnitBase,
      fakeUnitInfo("v", "DomainModels$ViewEntitySourceDocument", "MyModule", "OrderOverview"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 1 });
    expect(document.oql).toBe(
      "SELECT o.Total AS Total FROM MyModule.Purchase AS o JOIN o/MyModule.Purchase_Customer/MyModule.Customer AS c JOIN MyModule.OrderLine AS l WHERE c.Name = 'MyModule.Order'",
    );
    expect(document.name).toBe("OrderOverview");
  });

  it("rewrites only entity and attribute references in database connections, never SQL or settings", async () => {
    const groups = create();
    const mapping = {
      $Type: "DatabaseConnector$TableMapping",
      entity: "MyModule.Order",
      tableName: "MyModule.Order",
      columns: [{ $Type: "DatabaseConnector$ColumnMapping", attribute: "MyModule.Order.Total", columnName: "MyModule.Order" }],
    };
    const query = { $Type: "DatabaseConnector$DatabaseQuery", name: "GetOrders", query: "SELECT * FROM MyModule.Order", tableMappings: [mapping], parameters: [] };
    const connection = { $Type: "DatabaseConnector$DatabaseConnection", name: "Db", connectionString: "jdbc:MyModule.Order", queries: [query] };
    const result = await byLabel("References in database connections", groups).update(
      connection as unknown as Primitives.UnitBase,
      fakeUnitInfo("db", "DatabaseConnector$DatabaseConnection", "MyModule", "Db"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 2 });
    expect([mapping.entity, mapping.columns[0].attribute]).toEqual(["MyModule.Purchase", "MyModule.Purchase.Total"]);
    expect([query.query, mapping.tableName, mapping.columns[0].columnName, connection.connectionString]).toEqual([
      "SELECT * FROM MyModule.Order",
      "MyModule.Order",
      "MyModule.Order",
      "jdbc:MyModule.Order",
    ]);
  });

  it("rewrites the sheet entity and column attributes in Excel importer templates", async () => {
    const groups = create();
    const reference = { $Type: "ExcelDataImporter$NameReference", referencedName: "MyModule.Order" };
    const column = { $Type: "ExcelDataImporter$ColumnAttributeMapping", attribute: "MyModule.Order.Total", reference };
    const sheet = { $Type: "ExcelDataImporter$ExcelSheet", entity: "MyModule.Order", columnAttributeMappings: [column] };
    const template = {
      $Type: "ExcelDataImporter$Template",
      name: "ImportOrders",
      fileName: "MyModule.Order.xlsx",
      contents: { $Type: "ExcelDataImporter$ExcelTemplateContents", sheets: [sheet] },
    };
    const result = await byLabel("References in Excel importer templates", groups).update(
      template as unknown as Primitives.UnitBase,
      fakeUnitInfo("xl", "ExcelDataImporter$Template", "MyModule", "ImportOrders"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 2, renamedTo: null });
    expect([sheet.entity, column.attribute]).toEqual(["MyModule.Purchase", "MyModule.Purchase.Total"]);
    expect([template.name, template.fileName, reference.referencedName]).toEqual(["ImportOrders", "MyModule.Order.xlsx", "MyModule.Order"]);
  });

  it("rewrites entity and microflow references in business event services, keeping message names", async () => {
    const renames = QualifiedNameRenames.forEntity(context);
    renames.addDocument("MyModule", "ACT_Order_Publish", "ACT_Purchase_Publish");
    const groups = create(renames);
    const operation = {
      $Type: "BusinessEvents$ServiceOperation",
      entity: "MyModule.Order",
      microflow: "MyModule.ACT_Order_Publish",
      messageName: "MyModule.Order",
      operation: "publish",
    };
    const asyncApi = "channels: MyModule.Order";
    const service = { $Type: "BusinessEvents$BusinessEventService", name: "BES", document: asyncApi, operationImplementations: [operation] };
    const result = await byLabel("References in business event services", groups).update(
      service as unknown as Primitives.UnitBase,
      fakeUnitInfo("be", "BusinessEvents$BusinessEventService", "MyModule", "BES"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 2 });
    expect([operation.entity, operation.microflow]).toEqual(["MyModule.Purchase", "MyModule.ACT_Purchase_Publish"]);
    expect([operation.messageName, service.document]).toEqual(["MyModule.Order", asyncApi]);
  });

  it("rewrites entity, association and attribute references in change data capture services, keeping exposed names", async () => {
    const renames = QualifiedNameRenames.forEntity(context);
    renames.addDocument("MyModule", "Order_Customer", "Purchase_Customer");
    const groups = create(renames);
    const association = {
      $Type: "ChangeDataCapture$AssociationProperty",
      association: "MyModule.Order_Customer",
      exposedName: "MyModule.Order_Customer",
      versionedProperty: null,
    };
    const attribute = { $Type: "ChangeDataCapture$AttributeProperty", attribute: "MyModule.Order.Total", exposedName: "MyModule.Order", versionedProperty: null };
    const source = {
      $Type: "ChangeDataCapture$EntityChangeSource",
      entity: "MyModule.Order",
      exposedName: "MyModule.Order",
      properties: [association, attribute],
      versionedSource: null,
    };
    const service = { $Type: "ChangeDataCapture$EntityChangeDataCaptureService", name: "CDC", serviceName: "MyModule.Order", sources: [source], baseline: null };
    const result = await byLabel("References in change data capture services", groups).update(
      service as unknown as Primitives.UnitBase,
      fakeUnitInfo("cdc", "ChangeDataCapture$EntityChangeDataCaptureService", "MyModule", "CDC"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 3 });
    expect([source.entity, association.association, attribute.attribute]).toEqual([
      "MyModule.Purchase",
      "MyModule.Purchase_Customer",
      "MyModule.Purchase.Total",
    ]);
    expect([source.exposedName, association.exposedName, attribute.exposedName, service.serviceName]).toEqual([
      "MyModule.Order",
      "MyModule.Order_Customer",
      "MyModule.Order",
      "MyModule.Order",
    ]);
  });

  it("rewrites renamed Java actions in connector types only", async () => {
    const renames = QualifiedNameRenames.forEntity(context);
    renames.addDocument("MyModule", "JA_GetOrder", "JA_GetPurchase");
    const groups = create(renames);
    const connectorAction = { $Type: "ConnectorKit$ConnectorAction", name: "GetOrder", caption: "MyModule.JA_GetOrder", javaAction: "MyModule.JA_GetOrder" };
    const type = { $Type: "ConnectorKit$ConnectorType", name: "Crm", description: "MyModule.Order", connectorActions: [connectorAction], connectorProperties: [] };
    const result = await byLabel("References in connector types", groups).update(
      type as unknown as Primitives.UnitBase,
      fakeUnitInfo("ct", "ConnectorKit$ConnectorType", "MyModule", "Crm"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 1 });
    expect([connectorAction.javaAction, connectorAction.caption, type.description]).toEqual([
      "MyModule.JA_GetPurchase",
      "MyModule.JA_GetOrder",
      "MyModule.Order",
    ]);
    expect(EXCLUDED_DOCUMENT_TYPES.map((e) => e.label)).toEqual(
      expect.arrayContaining(["Database connections, Excel importer templates, connectors", "Business event and change data capture services"]),
    );
  });

  it("rewrites only entity and attribute references in ML model mappings, never renaming them", async () => {
    const groups = create();
    const tensor = { $Type: "MLMappings$TensorMappingElement", attribute: "MyModule.Order.Total", tensorName: "MyModule.Order", staticTensorShape: [], tensorShape: [] };
    const input = { $Type: "MLMappings$MLModelEntityMappings", entity: "MyModule.Order", mappings: [tensor] };
    const output = { $Type: "MLMappings$MLModelEntityMappings", entity: "MyModule.OrderLine", mappings: [] };
    const metadata = { $Type: "MLMappings$MLModelMetadata", name: "MyModule.Order", value: "MyModule.Order" };
    const document = {
      $Type: "MLMappings$MLMappingDocument",
      name: "Order",
      mlModelFileName: "MyModule.Order.onnx",
      mlModelMappings: { $Type: "MLMappings$MLModelMappings", input, output },
      mlModelMetadata: [metadata],
    };
    const result = await byLabel("References in ML model mappings", groups).update(
      document as unknown as Primitives.UnitBase,
      fakeUnitInfo("ml", "MLMappings$MLMappingDocument", "MyModule", "Order"),
    );
    expect(result).toMatchObject({ changed: true, updatedReferences: 2, renamedTo: null });
    expect(input.entity).toBe("MyModule.Purchase");
    expect(tensor.attribute).toBe("MyModule.Purchase.Total");
    expect(output.entity).toBe("MyModule.OrderLine");
    expect([document.name, document.mlModelFileName, tensor.tensorName, metadata.name, metadata.value]).toEqual([
      "Order",
      "MyModule.Order.onnx",
      "MyModule.Order",
      "MyModule.Order",
      "MyModule.Order",
    ]);
    expect(all().some((u) => u.unitType === "MLMappings$MLMappingDocument" && !(u instanceof ReferenceUpdater))).toBe(false);
    expect(EXCLUDED_DOCUMENT_TYPES.map((e) => e.label)).toContain("ML model mappings");
  });

  it("renames a published OData service and its exposed names only when opted in", async () => {
    const odata = () => ({
      $Type: "ODataPublish$PublishedODataService2",
      name: "POS_Order",
      path: "odata/Order/v1",
      entityTypes: [{ $Type: "ODataPublish$EntityType", entity: "MyModule.Order", exposedName: "Order", childMembers: [] }],
      entitySets: [{ $Type: "ODataPublish$EntitySet", entityType: "MyModule.Order", exposedName: "Orders" }],
    });
    const info = fakeUnitInfo("pos", "ODataPublish$PublishedODataService2", "MyModule", "POS_Order");
    for (const optIn of [false, true]) {
      const optContext = fakeContext({ renameExposedNames: optIn });
      const groups = createUpdaters(model, {
        context: optContext,
        documentNames: new DocumentNameRegistry(),
        renames: QualifiedNameRenames.forEntity(optContext),
        associationPlan: new AssociationRenamePlan(),
        messageDefinitionUsage: new MessageDefinitionUsage(),
      });
      const service = odata();
      await byLabel("Published OData services (plan)", groups).update(service as unknown as Primitives.UnitBase, info);
      const result = await byLabel("Published OData services", groups).update(service as unknown as Primitives.UnitBase, info);
      expect(result).toMatchObject({ changed: true, renamedTo: "POS_Purchase", renamedExposedNames: optIn ? 2 : 0 });
      expect(service.entityTypes[0].exposedName).toBe(optIn ? "Purchase" : "Order");
      expect(service.entitySets[0].exposedName).toBe(optIn ? "Purchases" : "Orders");
      expect(service.path).toBe("odata/Order/v1");
    }
  });

  it("records the message definitions mappings use while planning them", async () => {
    const usage = new MessageDefinitionUsage();
    const groups = create(undefined, undefined, usage);
    const mapping = {
      $Type: "ExportMappings$ExportMapping",
      name: "EMM_Customer",
      messageDefinition: "MyModule.MD_Messages.Customer",
      messageDefinition2: null,
      jsonStructure: null,
      parameterName: "Parameter",
      rootMappingElements: [],
    } as unknown as Primitives.UnitBase;
    await byLabel("Export mappings (plan)", groups).update(mapping, fakeUnitInfo("emm", "ExportMappings$ExportMapping", "MyModule", "EMM_Customer"));
    usage.addEntityDefinition("MyModule.MD_Messages.Customer");
    expect(usage.mappingsOf("MyModule.MD_Messages")).toEqual(["MyModule.EMM_Customer"]);
  });

  it("records the message definitions that use the entity while planning them", async () => {
    const usage = new MessageDefinitionUsage();
    const groups = create(undefined, undefined, usage);
    usage.add("MyModule.MD_Order", "MyModule.IMM_Order");
    const definition = {
      $Type: "MessageDefinitions$MessageDefinition2",
      $ID: "md",
      name: "MD_Order",
      exposedEntity: { $Type: "MessageDefinitions$ExposedEntity", $ID: "exp", entity: "MyModule.Order", children: [] },
    } as unknown as Primitives.UnitBase;
    await byLabel("Message definition documents (plan)", groups).update(
      definition,
      fakeUnitInfo("md", "MessageDefinitions$MessageDefinition2", "MyModule", "MD_Order"),
    );
    expect(usage.mappingsOf("MyModule.MD_Order")).toEqual(["MyModule.IMM_Order"]);
  });

  it("never touches imported web services", () => {
    expect(all().some((u) => u.unitType === "WebServices$ImportedWebService")).toBe(false);
    expect(EXCLUDED_DOCUMENT_TYPES.map((e) => e.label)).toEqual(expect.arrayContaining(["Imported web services", "Consumed REST/OData services"]));
    expect(EXCLUDED_DOCUMENT_TYPES.map((e) => e.label)).not.toContain("Published REST/OData/web services");
  });

  it("renames a JSON structure only after an entity mapping using it was planned", async () => {
    const groups = create();
    const json = { $Type: "JsonStructures$JsonStructure", name: "JSON_Order", elements: [] } as unknown as Primitives.UnitBase;
    const jsonInfo = fakeUnitInfo("js", "JsonStructures$JsonStructure", "MyModule", "JSON_Order");
    const mapping = {
      $Type: "ImportMappings$ImportMapping",
      name: "IMM_Order",
      jsonStructure: "MyModule.JSON_Order",
      parameterType: { $Type: "DataTypes$UnknownType" },
      rootMappingElements: [{ $Type: "ImportMappings$ImportObjectMappingElement", entity: "MyModule.Order", children: [] }],
    } as unknown as Primitives.UnitBase;
    await byLabel("Import mappings (plan)", groups).update(mapping, fakeUnitInfo("imm", "ImportMappings$ImportMapping", "MyModule", "IMM_Order"));
    await byLabel("JSON structures (plan)", groups).update(json, jsonInfo);
    expect(await byLabel("JSON structures", groups).update(json, jsonInfo)).toMatchObject({ changed: true, renamedTo: "JSON_Purchase" });
  });
});
