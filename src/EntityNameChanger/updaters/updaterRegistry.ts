import type { DomainModels, Primitives, StudioProApi } from "@mendix/extensions-api";
import type { AssociationRenamePlan } from "../framework/AssociationRenamePlan";
import type { DocumentNameRegistry } from "../framework/DocumentNameRegistry";
import { DocumentRenamePlan } from "../framework/DocumentRenamePlan";
import { NamingPolicy } from "../framework/NamingPolicy";
import type { QualifiedNameRenames } from "../framework/QualifiedNameRenames";
import type { RenameContext } from "../framework/RenameContext";
import type { RenameOptions, UnitAccess, UnitUpdater, UpdaterMode } from "../framework/types";
import { FlowUpdater, type FlowUpdaterDeps } from "./microflows/FlowUpdater";
import { MicroflowHelper } from "./microflows/MicroflowHelper";
import { AssociationUpdater, type AssociationUpdaterDeps } from "./domainModels/AssociationUpdater";
import { ReferenceCache } from "./microflows/ReferenceCache";
import { ReferenceResolver } from "./microflows/ReferenceResolver";
import { PageHelper } from "./pages/PageHelper";
import { PageUpdater, type PageUpdaterDeps } from "./pages/PageUpdater";
import { ReferenceUpdater } from "./references/ReferenceUpdater";
import { RefreshUpdater } from "./refresh/RefreshUpdater";
import { createStubUpdater } from "./StubUpdater";

export type AppModel = StudioProApi["app"]["model"];

export type UpdaterDeps = {
  context: RenameContext;
  documentNames: DocumentNameRegistry;
  // Seeded with the entity rename; filled by the planners, read by the reference updaters.
  renames: QualifiedNameRenames;
  // Filled by the association planner; read by the association renamer and the entity step.
  associationPlan: AssociationRenamePlan;
  options: RenameOptions;
};

// Document types that are never renamed, with the reason. Their references are still updated where listed
// in REFERENCE_DOCUMENT_TYPES.
export const EXCLUDED_DOCUMENT_TYPES: readonly { label: string; reason: string }[] = [
  { label: "Published REST/OData/web services", reason: "exposed names are an external contract" },
  { label: "Layouts, menus, scheduled events", reason: "not derived from entity names" },
  { label: "Page templates, building blocks", reason: "templates only, not checked by Studio Pro" },
  { label: "Enumerations, constants", reason: "not derived from entity names" },
];

// Document types whose references to the renamed entity, documents and parameters are rewritten in the last
// phase, in this order. api is the app.model property. Domain models first: saving one seems to make Studio Pro
// re-check its module's documents against stale flow parameters, so flows and pages must be saved after it.
export const REFERENCE_DOCUMENT_TYPES: readonly { documents: string; unitType: string; api: keyof AppModel }[] = [
  { documents: "domain models", unitType: "DomainModels$DomainModel", api: "domainModels" },
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
  { documents: "datasets", unitType: "DataSets$DataSet", api: "dataSets" },
  { documents: "document templates", unitType: "DocumentTemplates$DocumentTemplate", api: "documentTemplates" },
  { documents: "scheduled events", unitType: "ScheduledEvents$ScheduledEvent", api: "scheduledEvents" },
  { documents: "published REST services", unitType: "Rest$PublishedRestService", api: "publishedRestServices" },
  {
    documents: "published OData services",
    unitType: "ODataPublish$PublishedODataService2",
    api: "publishedODataServices2",
  },
  { documents: "published web services", unitType: "WebServices$PublishedWebService", api: "publishedWebServices" },
];

export type UpdaterGroups = {
  // Read-only: decide document renames and record every renamed qualified name; the only phase that resolves.
  planners: UnitUpdater[];
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
    },
    references,
    renames,
  );
  // Updaters run in sequence, so one helper serves microflows and nanoflows; the same holds for pages and snippets.
  const flowDeps: FlowUpdaterDeps = {
    helper: new MicroflowHelper(context, naming, references),
    resolver,
    documentNames,
    renames,
    plan,
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

  const flows = (mode: UpdaterMode, unitType: "Microflows$Microflow" | "Microflows$Nanoflow"): UnitUpdater => {
    const kind = unitType === "Microflows$Microflow" ? "microflow" : "nanoflow";
    const documents = `${kind}s`;
    const label = `${kind === "microflow" ? "Microflows" : "Nanoflows"}${mode === "plan" ? " (plan)" : ""}`;
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
      (unitType === "Microflows$Microflow" ? model.microflows : model.nanoflows) as unknown as UnitAccess<never>,
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
    flows("plan", "Microflows$Microflow"),
    flows("plan", "Microflows$Nanoflow"),
    createStubUpdater("Rules", "Microflows$Rule", model.rules, "Renaming parameters and rules"),
    pages("plan", "Pages$Page"),
    pages("plan", "Pages$Snippet"),
    createStubUpdater("Workflows", "Workflows$Workflow", model.workflows, "Renaming workflows"),
    createStubUpdater("Import mappings", "ImportMappings$ImportMapping", model.importMappings, "Renaming import mappings"),
    createStubUpdater("Export mappings", "ExportMappings$ExportMapping", model.exportMappings, "Renaming export mappings"),
    createStubUpdater("JSON structures", "JsonStructures$JsonStructure", model.jsonStructures, "Renaming JSON structures"),
    createStubUpdater(
      "Message definitions",
      "MessageDefinitions$MessageDefinitionCollection",
      model.messageDefinitions,
      "Renaming message definitions",
    ),
    // Name only, off by default when built: renaming also renames the Java class file.
    createStubUpdater("Java actions", "JavaActions$JavaAction", model.javaActions, "Renaming Java actions"),
    createStubUpdater(
      "JavaScript actions",
      "JavaScriptActions$JavaScriptAction",
      model.javaScriptActions,
      "Renaming JavaScript actions",
    ),
    createStubUpdater(
      "Document templates",
      "DocumentTemplates$DocumentTemplate",
      model.documentTemplates,
      "Renaming document templates and their parameters",
    ),
    createStubUpdater("Datasets", "DataSets$DataSet", model.dataSets, "Renaming datasets and their parameters"),
    // Last: needs every planned document rename, for names shared by a document and an association.
    new AssociationUpdater("plan", domainModels, associationDeps) as unknown as UnitUpdater,
  ];

  const renamers: UnitUpdater[] = [
    // Other modules' domain models; the entity's own one is renamed by the entity step.
    new AssociationUpdater("rename", domainModels, associationDeps) as unknown as UnitUpdater,
    flows("rename", "Microflows$Microflow"),
    flows("rename", "Microflows$Nanoflow"),
    pages("rename", "Pages$Page"),
    pages("rename", "Pages$Snippet"),
  ];

  const referenceUpdaters: UnitUpdater[] = REFERENCE_DOCUMENT_TYPES.map(
    (type) =>
      new ReferenceUpdater(
        { documents: type.documents, unitType: type.unitType },
        model[type.api] as unknown as UnitAccess<Primitives.UnitBase>,
        renames,
      ),
  );

  const refreshers: UnitUpdater[] = [
    new RefreshUpdater({ documents: "pages", unitType: "Pages$Page" }, model.pages as unknown as UnitAccess<Primitives.UnitBase>),
    new RefreshUpdater(
      { documents: "snippets", unitType: "Pages$Snippet" },
      model.snippets as unknown as UnitAccess<Primitives.UnitBase>,
    ),
  ];

  const all = [...planners, ...renamers, ...referenceUpdaters, ...refreshers];
  console.info(
    `updaters: ${all.map((u) => `${u.label}${u.implemented ? "" : " (stub)"}`).join(", ")}; excluded: ${EXCLUDED_DOCUMENT_TYPES.map((e) => e.label).join(", ")}`,
  );
  return { planners, renamers, referenceUpdaters, refreshers };
}
