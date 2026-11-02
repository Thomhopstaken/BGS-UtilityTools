import type { DomainModels, Primitives } from "@mendix/extensions-api";
import type { AssociationRenamePlan } from "../framework/AssociationRenamePlan";
import type { DocumentNameRegistry } from "../../shared/rename/DocumentNameRegistry";
import type { MessageDefinitionUsage } from "../framework/MessageDefinitionUsage";
import { DocumentRenamePlan } from "../framework/DocumentRenamePlan";
import { NamingPolicy } from "../framework/NamingPolicy";
import type { QualifiedNameRenames } from "../../shared/rename/QualifiedNameRenames";
import type { RenameContext } from "../framework/RenameContext";
import type { PlanObserver } from "../../shared/rename/RenameJob";
import { ReferenceIndex } from "../../shared/rename/ReferenceIndex";
import type { UnitAccess, UnitUpdater, UpdaterMode } from "../../shared/rename/types";
import { FlowUpdater, type FlowUnitType, type FlowUpdaterDeps } from "./microflows/FlowUpdater";
import { MicroflowHelper } from "./microflows/MicroflowHelper";
import { AssociationUpdater, type AssociationUpdaterDeps } from "./domainModels/AssociationUpdater";
import { CodeActionInspector } from "./documents/CodeActionInspector";
import { DataSetInspector } from "./documents/DataSetInspector";
import { type DocumentInspector, DocumentUpdater, type DocumentUpdaterDeps } from "./documents/DocumentUpdater";
import { JsonStructureInspector } from "./documents/JsonStructureInspector";
import { MappingInspector } from "./documents/MappingInspector";
import { MessageDefinitionInspector } from "./documents/MessageDefinitionInspector";
import { PublishedServiceInspector } from "./documents/PublishedServiceInspector";
import { ViewEntitySourceInspector } from "./documents/ViewEntitySourceInspector";
import { WorkflowInspector } from "./documents/WorkflowInspector";
import { ReferenceCache } from "./microflows/ReferenceCache";
import { ReferenceResolver } from "./microflows/ReferenceResolver";
import { PageHelper } from "./pages/PageHelper";
import { PageUpdater, type PageUpdaterDeps } from "./pages/PageUpdater";
import { type AppModel, createReferenceUpdaters, type ReferenceDocumentType } from "../../shared/rename/referenceTypes";
import { RefreshUpdater } from "./refresh/RefreshUpdater";

export type UpdaterDeps = {
  context: RenameContext;
  documentNames: DocumentNameRegistry;
  // Seeded with the entity rename; filled by the planners, read by the reference updaters.
  renames: QualifiedNameRenames;
  // Filled by the association planner; read by the association renamer and the entity step.
  associationPlan: AssociationRenamePlan;
  // Filled by the mapping planners; read for the run log.
  messageDefinitionUsage: MessageDefinitionUsage;
  // Whether a unit was saved in this job. Lets flows rewrite references to existing names in their rename save;
  // without it every reference waits for the reference pass.
  isSaved?: (unitId: string) => boolean;
};

// Document types that are never renamed, with the reason. Their references are still updated where listed
// in REFERENCE_DOCUMENT_TYPES.
export const EXCLUDED_DOCUMENT_TYPES: readonly { label: string; reason: string }[] = [
  { label: "Consumed REST/OData services", reason: "names mirror an external API" },
  // Not in the reference pass either: no entity or app document references; mappings point to them, not back.
  { label: "Imported web services", reason: "names mirror an external API" },
  { label: "Layouts, menus, scheduled events", reason: "not derived from entity names" },
  { label: "Page templates, building blocks", reason: "templates only, not checked by Studio Pro" },
  { label: "Enumerations, constants", reason: "not derived from entity names" },
  // Entity and attribute references are updated.
  { label: "ML model mappings", reason: "name mirrors the model file" },
  // Entity, attribute and Java action references are updated.
  { label: "Database connections, Excel importer templates, connectors", reason: "names kept (lead decision)" },
  // Entity, association, attribute and microflow references are updated.
  { label: "Business event and change data capture services", reason: "exposed names are an external contract" },
  // Not loaded at all, references included; the run log warns when the app has any.
  { label: "Document templates", reason: "deprecated, and updating them failed" },
];

// Document types whose references to the renamed entity, documents and parameters are rewritten in the last
// phase, in this order. api is the app.model property. View entity queries (OQL) first, so view entities are saved
// after their query is valid. Then domain models: saving one seems to make Studio Pro re-check its module's documents
// against stale flow parameters, so flows and pages must be saved after it.
// Java and JavaScript actions, connector types, consumed services, ML model mappings, database connections and Excel
// importer templates next, so their callers are saved after the types they provide are fixed. onlyProperties: the rest
// of the document mirrors an external API (OpenAPI, OData metadata, exposed names), the model file (tensor names,
// metadata) or holds SQL, connection settings and file data, and is left alone.
export const REFERENCE_DOCUMENT_TYPES: readonly ReferenceDocumentType[] = [
  {
    documents: "view entity source documents",
    unitType: "DomainModels$ViewEntitySourceDocument",
    api: "viewEntitySourceDocuments",
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
    documents: "consumed REST services",
    unitType: "Rest$ConsumedRestService",
    api: "consumedRestServices",
    // Mapping trees (entity, association, attribute, mapping microflow and its parameters) and parameter data types.
    onlyProperties: new Set(["entity", "association", "attribute", "microflow", "parameter"]),
  },
  {
    documents: "consumed OData services",
    unitType: "Rest$ConsumedODataService",
    api: "consumedODataServices",
    onlyProperties: new Set(["configurationEntityMicroflow", "errorHandlingMicroflow", "headerListMicroflow"]),
  },
  {
    documents: "ML model mappings",
    unitType: "MLMappings$MLMappingDocument",
    api: "mlMappingDocuments",
    // Input and output entity, and the attribute per tensor.
    // UNVERIFIED: both hold qualified names (Module.Entity, Module.Entity.Attribute).
    onlyProperties: new Set(["entity", "attribute"]),
  },
  {
    documents: "database connections",
    unitType: "DatabaseConnector$DatabaseConnection",
    api: "databaseConnections",
    // Query result and parameter table mappings, and parameter data types. Never SQL or connection settings.
    // UNVERIFIED: attribute holds Module.Entity.Attribute.
    onlyProperties: new Set(["entity", "attribute"]),
  },
  {
    documents: "Excel importer templates",
    unitType: "ExcelDataImporter$Template",
    api: "excelDataImporterTemplates",
    // Sheet entity and column attributes. Before import mappings, which can use a template as source.
    onlyProperties: new Set(["entity", "attribute"]),
  },
  { documents: "microflows", unitType: "Microflows$Microflow", api: "microflows" },
  { documents: "nanoflows", unitType: "Microflows$Nanoflow", api: "nanoflows" },
  { documents: "rules", unitType: "Microflows$Rule", api: "rules" },
  { documents: "pages", unitType: "Pages$Page", api: "pages" },
  { documents: "snippets", unitType: "Pages$Snippet", api: "snippets" },
  { documents: "layouts", unitType: "Pages$Layout", api: "layouts" },
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
  {
    documents: "change data capture services",
    unitType: "ChangeDataCapture$EntityChangeDataCaptureService",
    api: "entityChangeDataCaptureServices",
    // Source entity and its properties; exposed names and versioned GUIDs are kept.
    onlyProperties: new Set(["entity", "association", "attribute"]),
  },
];

// Unit types handled by DocumentUpdater; the keys of documentTypes in createUpdaters.
type DocumentType =
  | "Workflows$Workflow"
  | "ImportMappings$ImportMapping"
  | "ExportMappings$ExportMapping"
  | "JsonStructures$JsonStructure"
  | "MessageDefinitions$MessageDefinitionCollection"
  | "MessageDefinitions$MessageDefinition2"
  | "DataSets$DataSet"
  | "DomainModels$ViewEntitySourceDocument"
  | "JavaActions$JavaAction"
  | "JavaScriptActions$JavaScriptAction"
  | "Rest$PublishedRestService"
  | "ODataPublish$PublishedODataService2"
  | "WebServices$PublishedWebService";

export type UpdaterGroups = {
  // Read-only: decide document renames and record every renamed qualified name; the only phase that resolves.
  planners: UnitUpdater[];
  // For the job: sees every unit the planners loaded (reference index, resolver cache).
  planObserver: PlanObserver;
  // After the entity rename: rename documents, parameters and variables as planned.
  renamers: UnitUpdater[];
  // Then: rewrite references in every document, once every renamed name exists.
  referenceUpdaters: UnitUpdater[];
  // Last: save changed pages and snippets again, so Studio Pro drops stale errors.
  refreshers: UnitUpdater[];
};

// The updaters of each phase; the job renames the entity between planners and renamers.
// The only place that touches app.model.
export function createUpdaters(model: AppModel, deps: UpdaterDeps): UpdaterGroups {
  const { context, documentNames, renames } = deps;
  const naming = new NamingPolicy(context.oldName, context.newName, context.protectedNames);
  // Document renames and work decided by the planners; read by the renamers.
  const plan = new DocumentRenamePlan();
  const references = new ReferenceCache();
  const resolver = new ReferenceResolver(
    {
      microflows: model.microflows,
      nanoflows: model.nanoflows,
      domainModels: model.domainModels,
      javaActions: model.javaActions,
      javaScriptActions: model.javaScriptActions,
      workflows: model.workflows,
      consumedRestServices: model.consumedRestServices,
      mlMappingDocuments: model.mlMappingDocuments,
      databaseConnections: model.databaseConnections,
      excelDataImporterTemplates: model.excelDataImporterTemplates,
      connectorTypes: model.connectorTypes,
    },
    references,
  );
  // Filled from every unit the planners load; lets the reference pass skip units without a renamed name.
  const referenceIndex = new ReferenceIndex();
  // Updaters run in sequence, so one helper serves microflows, nanoflows and rules; the same holds for pages and snippets.
  const flowDeps: FlowUpdaterDeps = {
    helper: new MicroflowHelper(context, naming, references),
    resolver,
    documentNames,
    renames,
    plan,
    references: deps.isSaved === undefined ? undefined : { isSaved: deps.isSaved, index: referenceIndex },
  };
  const pageDeps: PageUpdaterDeps = { helper: new PageHelper(context, naming), documentNames, renames, plan };
  const associationDeps: AssociationUpdaterDeps = {
    context,
    naming,
    documentNames,
    documentPlan: plan,
    renames,
    plan: deps.associationPlan,
  };
  const domainModels = model.domainModels as unknown as UnitAccess<DomainModels.DomainModel>;
  const documentDeps: DocumentUpdaterDeps = { naming, documentNames, renames, plan };
  // Filled by the mapping planners, read by the JSON structure planner after them.
  const usedJsonStructures = new Set<string>();
  const mappingInspector = new MappingInspector(context, naming, usedJsonStructures, deps.messageDefinitionUsage);
  const messageDefinitionInspector = new MessageDefinitionInspector(context, naming, deps.messageDefinitionUsage);
  const codeActionInspector = new CodeActionInspector(context, naming);
  const publishedServiceInspector = new PublishedServiceInspector(context, naming, renames);
  const documentTypes: Record<DocumentType, { kind: string; label: string; access: unknown; inspector: DocumentInspector<never> }> = {
    Workflows$Workflow: {
      kind: "workflow",
      label: "Workflows",
      access: model.workflows,
      inspector: new WorkflowInspector(context, naming) as unknown as DocumentInspector<never>,
    },
    ImportMappings$ImportMapping: {
      kind: "import mapping",
      label: "Import mappings",
      access: model.importMappings,
      inspector: mappingInspector as unknown as DocumentInspector<never>,
    },
    ExportMappings$ExportMapping: {
      kind: "export mapping",
      label: "Export mappings",
      access: model.exportMappings,
      inspector: mappingInspector as unknown as DocumentInspector<never>,
    },
    JsonStructures$JsonStructure: {
      kind: "JSON structure",
      label: "JSON structures",
      access: model.jsonStructures,
      inspector: new JsonStructureInspector(usedJsonStructures) as unknown as DocumentInspector<never>,
    },
    MessageDefinitions$MessageDefinitionCollection: {
      kind: "message definition",
      label: "Message definitions",
      access: model.messageDefinitions,
      inspector: messageDefinitionInspector as unknown as DocumentInspector<never>,
    },
    MessageDefinitions$MessageDefinition2: {
      kind: "message definition document",
      label: "Message definition documents",
      access: model.messageDefinitions2,
      inspector: messageDefinitionInspector as unknown as DocumentInspector<never>,
    },
    DataSets$DataSet: {
      kind: "dataset",
      label: "Datasets",
      access: model.dataSets,
      inspector: new DataSetInspector(context, naming) as unknown as DocumentInspector<never>,
    },
    DomainModels$ViewEntitySourceDocument: {
      kind: "view entity source document",
      label: "View entity source documents",
      access: model.viewEntitySourceDocuments,
      inspector: new ViewEntitySourceInspector(context) as unknown as DocumentInspector<never>,
    },
    JavaActions$JavaAction: {
      kind: "Java action",
      label: "Java actions",
      access: model.javaActions,
      inspector: codeActionInspector as unknown as DocumentInspector<never>,
    },
    JavaScriptActions$JavaScriptAction: {
      kind: "JavaScript action",
      label: "JavaScript actions",
      access: model.javaScriptActions,
      inspector: codeActionInspector as unknown as DocumentInspector<never>,
    },
    Rest$PublishedRestService: {
      kind: "published REST service",
      label: "Published REST services",
      access: model.publishedRestServices,
      inspector: publishedServiceInspector as unknown as DocumentInspector<never>,
    },
    ODataPublish$PublishedODataService2: {
      kind: "published OData service",
      label: "Published OData services",
      access: model.publishedODataServices2,
      inspector: publishedServiceInspector as unknown as DocumentInspector<never>,
    },
    WebServices$PublishedWebService: {
      kind: "published web service",
      label: "Published web services",
      access: model.publishedWebServices,
      inspector: publishedServiceInspector as unknown as DocumentInspector<never>,
    },
  };
  // Plan or rename updater for one document type; flows and pages below follow the same pattern.
  const documents = (mode: UpdaterMode, unitType: DocumentType): UnitUpdater => {
    const { kind, label, access, inspector } = documentTypes[unitType];
    const plural = `${kind}s`;
    return new DocumentUpdater(
      {
        label: `${label}${mode === "plan" ? " (plan)" : ""}`,
        title: mode === "plan" ? `Planning ${plural}` : undefined,
        unitType,
        kind,
        description: mode === "plan" ? `Finding ${plural} to rename` : `Renaming ${plural}`,
        mode,
      },
      access as UnitAccess<never>,
      inspector,
      documentDeps,
    ) as unknown as UnitUpdater;
  };

  const flowTypes: Record<FlowUnitType, { kind: string; label: string; access: unknown }> = {
    Microflows$Microflow: { kind: "microflow", label: "Microflows", access: model.microflows },
    Microflows$Nanoflow: { kind: "nanoflow", label: "Nanoflows", access: model.nanoflows },
    Microflows$Rule: { kind: "rule", label: "Rules", access: model.rules },
  };
  const flows = (mode: UpdaterMode, unitType: FlowUnitType): UnitUpdater => {
    const { kind, access } = flowTypes[unitType];
    const documents = `${kind}s`;
    const label = `${flowTypes[unitType].label}${mode === "plan" ? " (plan)" : ""}`;
    return new FlowUpdater(
      {
        label,
        title: mode === "plan" ? `Planning ${documents}` : undefined,
        unitType,
        kind,
        description:
          mode === "plan"
            ? `Finding variables, parameters and ${documents} to rename`
            : `Renaming variables, parameters and ${documents}`,
        mode,
      },
      access as UnitAccess<never>,
      flowDeps,
    );
  };
  const pages = (mode: UpdaterMode, unitType: "Pages$Page" | "Pages$Snippet"): UnitUpdater => {
    const kind = unitType === "Pages$Page" ? "page" : "snippet";
    const documents = `${kind}s`;
    const label = `${kind === "page" ? "Pages" : "Snippets"}${mode === "plan" ? " (plan)" : ""}`;
    return new PageUpdater(
      {
        label,
        title: mode === "plan" ? `Planning ${documents}` : undefined,
        unitType,
        kind,
        description:
          mode === "plan"
            ? `Finding ${documents} and parameters to rename`
            : `Renaming ${documents}, ${kind} parameters and their usages`,
        mode,
      },
      (unitType === "Pages$Page" ? model.pages : model.snippets) as unknown as UnitAccess<never>,
      pageDeps,
    );
  };

  const planners: UnitUpdater[] = [
    // Before the flows: their signatures are remembered from the plan, so flows calling them need no resolve().
    // Renaming also renames the action's code file; the run log warns to check the code.
    documents("plan", "JavaActions$JavaAction"),
    documents("plan", "JavaScriptActions$JavaScriptAction"),
    documents("plan", "Workflows$Workflow"),
    flows("plan", "Microflows$Microflow"),
    flows("plan", "Microflows$Nanoflow"),
    flows("plan", "Microflows$Rule"),
    pages("plan", "Pages$Page"),
    pages("plan", "Pages$Snippet"),
    documents("plan", "ImportMappings$ImportMapping"),
    documents("plan", "ExportMappings$ExportMapping"),
    // After the mappings: a JSON structure is renamed only when an entity mapping uses it.
    documents("plan", "JsonStructures$JsonStructure"),
    documents("plan", "MessageDefinitions$MessageDefinitionCollection"),
    documents("plan", "MessageDefinitions$MessageDefinition2"),
    documents("plan", "DataSets$DataSet"),
    // Only the renamed view entity's own source; every query is rewritten by the reference pass.
    documents("plan", "DomainModels$ViewEntitySourceDocument"),
    // After the flows and mappings: a published service uses the entity when it references a renamed document.
    documents("plan", "Rest$PublishedRestService"),
    documents("plan", "ODataPublish$PublishedODataService2"),
    documents("plan", "WebServices$PublishedWebService"),
    // Last: needs every planned document rename, for names shared by a document and an association.
    new AssociationUpdater("plan", domainModels, associationDeps) as unknown as UnitUpdater,
  ];

  const renamers: UnitUpdater[] = [
    // Other modules' domain models; the entity's own one is renamed by the entity step.
    new AssociationUpdater("rename", domainModels, associationDeps) as unknown as UnitUpdater,
    // Before the flows: flows calling them then rewrite those references in their own rename save.
    documents("rename", "JavaActions$JavaAction"),
    documents("rename", "JavaScriptActions$JavaScriptAction"),
    flows("rename", "Microflows$Microflow"),
    flows("rename", "Microflows$Nanoflow"),
    flows("rename", "Microflows$Rule"),
    pages("rename", "Pages$Page"),
    pages("rename", "Pages$Snippet"),
    documents("rename", "Workflows$Workflow"),
    documents("rename", "ImportMappings$ImportMapping"),
    documents("rename", "ExportMappings$ExportMapping"),
    documents("rename", "JsonStructures$JsonStructure"),
    documents("rename", "MessageDefinitions$MessageDefinitionCollection"),
    documents("rename", "MessageDefinitions$MessageDefinition2"),
    documents("rename", "DataSets$DataSet"),
    documents("rename", "DomainModels$ViewEntitySourceDocument"),
    documents("rename", "Rest$PublishedRestService"),
    documents("rename", "ODataPublish$PublishedODataService2"),
    documents("rename", "WebServices$PublishedWebService"),
  ];

  const referenceUpdaters = createReferenceUpdaters(model, REFERENCE_DOCUMENT_TYPES, renames, referenceIndex);

  // Every unit a planner loaded: its references are indexed and its signature remembered for callers.
  const planObserver: PlanObserver = (unit, info) => {
    referenceIndex.add(unit.$ID, unit);
    resolver.remember(unit, info);
  };

  // Only changed pages and snippets calling a document with renamed parameters.
  const refreshFilter = { index: referenceIndex, renames };
  const refreshers: UnitUpdater[] = [
    new RefreshUpdater(
      { documents: "pages", unitType: "Pages$Page" },
      model.pages as unknown as UnitAccess<Primitives.UnitBase>,
      refreshFilter,
    ),
    new RefreshUpdater(
      { documents: "snippets", unitType: "Pages$Snippet" },
      model.snippets as unknown as UnitAccess<Primitives.UnitBase>,
      refreshFilter,
    ),
  ];

  const all = [...planners, ...renamers, ...referenceUpdaters, ...refreshers];
  console.info(
    `updaters: ${all.map((u) => `${u.label}${u.implemented ? "" : " (stub)"}`).join(", ")}; excluded: ${EXCLUDED_DOCUMENT_TYPES.map((e) => e.label).join(", ")}`,
  );
  return { planners, planObserver, renamers, referenceUpdaters, refreshers };
}
