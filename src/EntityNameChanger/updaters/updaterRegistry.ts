import type { StudioProApi } from "@mendix/extensions-api";
import type { DocumentNameRegistry } from "../framework/DocumentNameRegistry";
import { NamingPolicy } from "../framework/NamingPolicy";
import type { RenameContext } from "../framework/RenameContext";
import type { RenameOptions, UnitUpdater } from "../framework/types";
import { MicroflowHelper } from "./microflows/MicroflowHelper";
import { MicroflowUpdater } from "./microflows/MicroflowUpdater";
import { ReferenceCache } from "./microflows/ReferenceCache";
import { ReferenceResolver } from "./microflows/ReferenceResolver";
import { createStubUpdater } from "./StubUpdater";

export type AppModel = StudioProApi["app"]["model"];

export type UpdaterDeps = {
  context: RenameContext;
  documentNames: DocumentNameRegistry;
  options: RenameOptions;
};

// Document types deliberately left alone, with the reason.
export const EXCLUDED_DOCUMENT_TYPES: readonly { label: string; reason: string }[] = [
  { label: "Published REST/OData/web services", reason: "exposed names are an external contract" },
  { label: "Layouts, page templates, building blocks", reason: "templates only, no entity usages" },
  { label: "Enumerations, constants, scheduled events", reason: "not derived from entity names" },
];

// All updaters in execution order. The domain model runs after every flow-type updater,
// and the entity itself is renamed by the job's final step. The only place that touches app.model.
export function createUpdaters(model: AppModel, deps: UpdaterDeps): UnitUpdater[] {
  const { context, documentNames, options } = deps;
  const naming = new NamingPolicy(context.oldName, context.newName, context.protectedNames);
  const references = new ReferenceCache();
  const resolver = new ReferenceResolver(
    {
      microflows: model.microflows,
      domainModels: model.domainModels,
      javaActions: model.javaActions,
      workflows: model.workflows,
      consumedRestServices: model.consumedRestServices,
      mlMappingDocuments: model.mlMappingDocuments,
    },
    references,
  );

  const updaters: UnitUpdater[] = [
    new MicroflowUpdater(model.microflows, new MicroflowHelper(context, naming, references), resolver, documentNames),
    // Reuses MicroflowHelper; nanoflow parameters only live in the object collection.
    createStubUpdater("Nanoflows", "Microflows$Nanoflow", model.nanoflows, "Renaming variables, parameters and nanoflows"),
    createStubUpdater("Rules", "Microflows$Rule", model.rules, "Renaming parameters and rules"),
  ];
  if (options.renamePages) {
    updaters.push(
      createStubUpdater("Pages", "Pages$Page", model.pages, "Renaming pages, page parameters and their usages"),
      createStubUpdater("Snippets", "Pages$Snippet", model.snippets, "Renaming snippets and snippet parameters"),
    );
  } else {
    console.info("pages and snippets skipped: not selected");
  }
  updaters.push(
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
    // Associations in every own module, cross-module associations included.
    createStubUpdater("Associations", "DomainModels$DomainModel", model.domainModels, "Renaming associations"),
  );
  console.info(
    `updaters: ${updaters.map((u) => `${u.label}${u.implemented ? "" : " (stub)"}`).join(", ")}; excluded: ${EXCLUDED_DOCUMENT_TYPES.map((e) => e.label).join(", ")}`,
  );
  return updaters;
}
