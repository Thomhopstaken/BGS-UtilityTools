import type { ReferenceDocumentType } from "../shared/rename/referenceTypes";

// Document types whose references to renamed documents are rewritten, in this order: enumerations and domain models
// first (they define what callers use), then actions and services that provide types, then flows, pages and the rest,
// published services last. onlyProperties: the rest of the document mirrors an external API, the model file or holds
// SQL and connection settings, and is left alone.
// Left out, as they reference no documents: view entity sources (OQL names entities only), ML model mappings, Excel
// importer templates, change data capture services, constants, image and icon collections, regular expressions, JSON
// structures, XML schemas and data transformers. UNVERIFIED for the last two.
// UNVERIFIED: every property added for the Prefixer (constants in connection settings, proxies, authentication)
// holds a qualified name, not a literal.
export const PREFIX_REFERENCE_DOCUMENT_TYPES: readonly ReferenceDocumentType[] = [
  {
    documents: "enumerations",
    unitType: "Enumerations$Enumeration",
    api: "enumerations",
    // Value images (Module.Collection.Image) and the consumed OData service of a remote enumeration.
    onlyProperties: new Set(["image", "consumedODataService"]),
  },
  { documents: "domain models", unitType: "DomainModels$DomainModel", api: "domainModels" },
  { documents: "Java actions", unitType: "JavaActions$JavaAction", api: "javaActions" },
  { documents: "JavaScript actions", unitType: "JavaScriptActions$JavaScriptAction", api: "javaScriptActions" },
  {
    documents: "connector types",
    unitType: "ConnectorKit$ConnectorType",
    api: "connectorTypes",
    onlyProperties: new Set(["javaAction"]),
  },
  {
    documents: "connectors",
    unitType: "ConnectorKit$Connector",
    api: "connectors",
    // The connector type and expressions of its property values (constants).
    onlyProperties: new Set(["connector", "connectorProperty", "propertyValueExpression"]),
  },
  {
    documents: "authentications",
    unitType: "Authentication$Authentication",
    api: "authentications",
    // Credentials and endpoints, which can be constants.
    onlyProperties: new Set([
      "username",
      "password",
      "clientId",
      "clientSecret",
      "tenantId",
      "authorizationEndpoint",
      "callbackUrl",
      "tokenEndPoint",
    ]),
  },
  {
    documents: "consumed REST services",
    unitType: "Rest$ConsumedRestService",
    api: "consumedRestServices",
    // As for entity renames, plus enumeration data types and constant values.
    onlyProperties: new Set([
      "entity",
      "association",
      "attribute",
      "microflow",
      "parameter",
      "DataTypes$EnumerationType.enumeration",
      "Rest$ConstantValue.value",
    ]),
  },
  {
    documents: "consumed OData services",
    unitType: "Rest$ConsumedODataService",
    api: "consumedODataServices",
    // Microflows, as for entity renames, plus proxy, timeout, location and authentication settings (constants or
    // expressions) and header values.
    onlyProperties: new Set([
      "configurationEntityMicroflow",
      "errorHandlingMicroflow",
      "headerListMicroflow",
      "proxyHost",
      "proxyPort",
      "proxyUsername",
      "proxyPassword",
      "timeoutExpression",
      "customLocation",
      "httpAuthenticationUserName",
      "authenticationPassword",
      "Microflows$HttpHeaderEntry.value",
    ]),
  },
  {
    documents: "imported web services",
    unitType: "WebServices$ImportedWebService",
    api: "importedWebServices",
    onlyProperties: new Set(["locationConstant"]),
  },
  {
    documents: "database connections",
    unitType: "DatabaseConnector$DatabaseConnection",
    api: "databaseConnections",
    // As for entity renames, plus connection settings (constants) and enumeration data types. Never SQL.
    onlyProperties: new Set([
      "entity",
      "attribute",
      "connectionString",
      "userName",
      "password",
      "DataTypes$EnumerationType.enumeration",
      "DatabaseConnector$ValueAsConstant.value",
      "DatabaseConnector$ConnectionString.value",
    ]),
  },
  { documents: "microflows", unitType: "Microflows$Microflow", api: "microflows" },
  { documents: "nanoflows", unitType: "Microflows$Nanoflow", api: "nanoflows" },
  { documents: "rules", unitType: "Microflows$Rule", api: "rules" },
  { documents: "pages", unitType: "Pages$Page", api: "pages" },
  { documents: "snippets", unitType: "Pages$Snippet", api: "snippets" },
  { documents: "layouts", unitType: "Pages$Layout", api: "layouts" },
  { documents: "page templates", unitType: "Pages$PageTemplate", api: "pageTemplates" },
  { documents: "building blocks", unitType: "Pages$BuildingBlock", api: "buildingBlocks" },
  { documents: "menus", unitType: "Menus$MenuDocument", api: "menuDocuments" },
  { documents: "workflows", unitType: "Workflows$Workflow", api: "workflows" },
  { documents: "import mappings", unitType: "ImportMappings$ImportMapping", api: "importMappings" },
  { documents: "export mappings", unitType: "ExportMappings$ExportMapping", api: "exportMappings" },
  {
    documents: "message definitions",
    unitType: "MessageDefinitions$MessageDefinitionCollection",
    api: "messageDefinitions",
  },
  {
    documents: "message definition documents",
    unitType: "MessageDefinitions$MessageDefinition2",
    api: "messageDefinitions2",
  },
  { documents: "datasets", unitType: "DataSets$DataSet", api: "dataSets" },
  { documents: "scheduled events", unitType: "ScheduledEvents$ScheduledEvent", api: "scheduledEvents" },
  {
    documents: "task queues",
    unitType: "Queues$Queue",
    api: "queues",
    // The parallelism expression can use a constant.
    onlyProperties: new Set(["parallelismExpression"]),
  },
  { documents: "published REST services", unitType: "Rest$PublishedRestService", api: "publishedRestServices" },
  {
    documents: "published OData services",
    unitType: "ODataPublish$PublishedODataService2",
    api: "publishedODataServices2",
  },
  { documents: "published web services", unitType: "WebServices$PublishedWebService", api: "publishedWebServices" },
  {
    documents: "business event services",
    unitType: "BusinessEvents$BusinessEventService",
    api: "businessEventServices",
    // Operation entity and microflow; message names and the AsyncAPI document are kept.
    onlyProperties: new Set(["entity", "microflow"]),
  },
];
