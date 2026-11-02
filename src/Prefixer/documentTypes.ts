import type { AppModel } from "../shared/rename/referenceTypes";

// What a renamed document may break outside the model API; each risk becomes a "Check yourself" run log row.
export type PrefixRisk =
  | "navigation"
  | "settings"
  | "constantValues"
  | "actionCode"
  | "javaProxies"
  | "reportWidgets"
  | "scheduledEvents"
  | "workflowInstances"
  | "queuedTasks"
  | "themeImages"
  | "apiClients";

export type RenamableType = {
  readonly unitType: string;
  readonly api: keyof AppModel;
  // A prefix belongs to one group; microflows and nanoflows share one (lead's rule).
  readonly group: string;
  readonly groupLabel: string;
  // Singular, e.g. "microflow".
  readonly kind: string;
  readonly risks: readonly PrefixRisk[];
};

const FLOWS = { group: "flows", groupLabel: "Microflows & nanoflows" };

// Own group per type; label is the plural of kind with a capital.
function single(unitType: string, api: keyof AppModel, kind: string, plural: string, risks: readonly PrefixRisk[] = []): RenamableType {
  return { unitType, api, group: api, groupLabel: plural, kind, risks };
}

// Every document type a prefix can be renamed for, callees first: a caller renamed later rewrites its references to
// them in the same save. The order only saves work; the reference pass fixes the rest.
export const RENAMABLE_DOCUMENT_TYPES: readonly RenamableType[] = [
  single("Constants$Constant", "constants", "constant", "Constants", ["constantValues", "javaProxies"]),
  single("Enumerations$Enumeration", "enumerations", "enumeration", "Enumerations", ["javaProxies"]),
  single("Images$ImageCollection", "imageCollections", "image collection", "Image collections", ["themeImages"]),
  single("CustomIcons$CustomIconCollection", "customIconCollections", "icon collection", "Icon collections", ["themeImages"]),
  single("RegularExpressions$RegularExpression", "regularExpressions", "regular expression", "Regular expressions"),
  single("JsonStructures$JsonStructure", "jsonStructures", "JSON structure", "JSON structures"),
  single("XmlSchemas$XmlSchema", "xmlSchemas", "XML schema", "XML schemas"),
  single("MessageDefinitions$MessageDefinitionCollection", "messageDefinitions", "message definition", "Message definitions"),
  single("MessageDefinitions$MessageDefinition2", "messageDefinitions2", "message definition document", "Message definition documents"),
  single("ImportMappings$ImportMapping", "importMappings", "import mapping", "Import mappings"),
  single("ExportMappings$ExportMapping", "exportMappings", "export mapping", "Export mappings"),
  single("DataTransformers$DataTransformer", "dataTransformers", "data transformer", "Data transformers"),
  single("JavaActions$JavaAction", "javaActions", "Java action", "Java actions", ["actionCode"]),
  single("JavaScriptActions$JavaScriptAction", "javaScriptActions", "JavaScript action", "JavaScript actions", ["actionCode"]),
  single("ConnectorKit$ConnectorType", "connectorTypes", "connector type", "Connector types"),
  single("ConnectorKit$Connector", "connectors", "connector", "Connectors"),
  single("Authentication$Authentication", "authentications", "authentication", "Authentications"),
  single("Rest$ConsumedRestService", "consumedRestServices", "consumed REST service", "Consumed REST services"),
  single("Rest$ConsumedODataService", "consumedODataServices", "consumed OData service", "Consumed OData services"),
  single("WebServices$ImportedWebService", "importedWebServices", "imported web service", "Imported web services"),
  single("DatabaseConnector$DatabaseConnection", "databaseConnections", "database connection", "Database connections"),
  single("ExcelDataImporter$Template", "excelDataImporterTemplates", "Excel importer template", "Excel importer templates"),
  single("MLMappings$MLMappingDocument", "mlMappingDocuments", "ML model mapping", "ML model mappings"),
  single("Queues$Queue", "queues", "task queue", "Task queues", ["queuedTasks"]),
  single("Microflows$Rule", "rules", "rule", "Rules"),
  { unitType: "Microflows$Nanoflow", api: "nanoflows", ...FLOWS, kind: "nanoflow", risks: ["navigation"] },
  { unitType: "Microflows$Microflow", api: "microflows", ...FLOWS, kind: "microflow", risks: ["navigation", "settings", "javaProxies"] },
  single("Pages$Layout", "layouts", "layout", "Layouts"),
  single("Pages$Snippet", "snippets", "snippet", "Snippets"),
  single("Pages$Page", "pages", "page", "Pages", ["navigation"]),
  single("Pages$PageTemplate", "pageTemplates", "page template", "Page templates"),
  single("Pages$BuildingBlock", "buildingBlocks", "building block", "Building blocks"),
  single("Menus$MenuDocument", "menuDocuments", "menu", "Menus"),
  single("Workflows$Workflow", "workflows", "workflow", "Workflows", ["workflowInstances"]),
  single("DataSets$DataSet", "dataSets", "dataset", "Datasets", ["reportWidgets"]),
  single("ScheduledEvents$ScheduledEvent", "scheduledEvents", "scheduled event", "Scheduled events", ["scheduledEvents"]),
  single("Rest$PublishedRestService", "publishedRestServices", "published REST service", "Published REST services", ["apiClients"]),
  single("ODataPublish$PublishedODataService2", "publishedODataServices2", "published OData service", "Published OData services", ["apiClients"]),
  single("WebServices$PublishedWebService", "publishedWebServices", "published web service", "Published web services", ["apiClients"]),
  single("BusinessEvents$BusinessEventService", "businessEventServices", "business event service", "Business event services"),
  single("ChangeDataCapture$EntityChangeDataCaptureService", "entityChangeDataCaptureServices", "change data capture service", "Change data capture services"),
];

// Documents the Prefixer never renames, with the reason; they are left out of the prefix list.
export const NOT_RENAMED_TYPES: ReadonlyMap<string, string> = new Map([
  ["DomainModels$ViewEntitySourceDocument", "keeps the name of its view entity"],
  ["DocumentTemplates$DocumentTemplate", "deprecated; never changed"],
  ["CustomBlobDocuments$CustomBlobDocument", "owned by another extension"],
  ["DomainModels$DomainModel", "has a fixed name"],
  ["Projects$ModuleSettings", "has a fixed name"],
  ["Security$ModuleSecurity", "has a fixed name"],
]);

const BY_UNIT_TYPE: ReadonlyMap<string, RenamableType> = new Map(RENAMABLE_DOCUMENT_TYPES.map((type) => [type.unitType, type]));

export function renamableType(unitType: string): RenamableType | undefined {
  return BY_UNIT_TYPE.get(unitType);
}

// The types of one group, in rename order.
export function typesOfGroup(group: string): RenamableType[] {
  return RENAMABLE_DOCUMENT_TYPES.filter((type) => type.group === group);
}

export function groupLabel(group: string): string {
  return RENAMABLE_DOCUMENT_TYPES.find((type) => type.group === group)?.groupLabel ?? group;
}
