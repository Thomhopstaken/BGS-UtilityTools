import type {
  DataSets,
  DomainModels,
  ExportMappings,
  ImportMappings,
  JavaActions,
  JavaScriptActions,
  JsonStructures,
  MessageDefinitions,
  Workflows,
} from "@mendix/extensions-api";

// Test-only builders for workflows, mappings, JSON structures, message definitions, datasets and Java/JavaScript
// actions; plain objects cast to the Mendix types.

type Props = Record<string, unknown>;

let nextId = 0;
const newId = (prefix: string) => `${prefix}-${++nextId}`;

export function stringTemplate(text: string, ...expressions: string[]): Props {
  return {
    $Type: "Microflows$StringTemplate",
    text,
    arguments: expressions.map((expression) => ({ $Type: "Microflows$TemplateArgument", expression })),
  };
}

export function workflowActivity(type: string, props: Props = {}): Props {
  return { $Type: `Workflows$${type}`, $ID: newId(type), name: type, caption: type, ...props };
}

export type WorkflowSpec = {
  name?: string;
  // null: no parameter.
  entity?: string | null;
  parameterName?: string;
  title?: string;
  workflowName?: Props;
  activities?: Props[];
};

export function workflow(spec: WorkflowSpec = {}): Workflows.Workflow {
  const entity = spec.entity === undefined ? "MyModule.Order" : spec.entity;
  return {
    $Type: "Workflows$Workflow",
    $ID: newId("wf"),
    name: spec.name ?? "WF_Test",
    title: spec.title ?? "Test",
    parameter: entity === null ? null : { $Type: "Workflows$Parameter", entity, name: spec.parameterName ?? "WorkflowContext" },
    workflowName: spec.workflowName ?? stringTemplate("Test"),
    workflowDescription: stringTemplate(""),
    flow: { $Type: "Workflows$Flow", activities: spec.activities ?? [] },
    eventSubProcesses: [],
  } as unknown as Workflows.Workflow;
}

export function objectElement(entity: string | null, children: Props[] = [], props: Props = {}): Props {
  return { $Type: "ImportMappings$ImportObjectMappingElement", $ID: newId("ome"), entity, association: null, children, ...props };
}

export function valueElement(attribute: string): Props {
  return { $Type: "ImportMappings$ImportValueMappingElement", $ID: newId("vme"), attribute };
}

export type MappingSpec = {
  name?: string;
  roots?: Props[];
  jsonStructure?: string | null;
};

export function importMapping(spec: MappingSpec = {}, parameterType: Props = { $Type: "DataTypes$UnknownType" }): ImportMappings.ImportMapping {
  return {
    $Type: "ImportMappings$ImportMapping",
    $ID: newId("imm"),
    name: spec.name ?? "IMM_Test",
    rootMappingElements: spec.roots ?? [],
    jsonStructure: spec.jsonStructure ?? null,
    parameterType,
  } as unknown as ImportMappings.ImportMapping;
}

export function exportMapping(spec: MappingSpec = {}, parameterName = "Parameter"): ExportMappings.ExportMapping {
  return {
    $Type: "ExportMappings$ExportMapping",
    $ID: newId("emm"),
    name: spec.name ?? "EMM_Test",
    rootMappingElements: spec.roots ?? [],
    jsonStructure: spec.jsonStructure ?? null,
    parameterName,
  } as unknown as ExportMappings.ExportMapping;
}

export function jsonStructure(name: string): JsonStructures.JsonStructure {
  return { $Type: "JsonStructures$JsonStructure", $ID: newId("json"), name, elements: [], jsonSnippet: "{}" } as unknown as JsonStructures.JsonStructure;
}

export const objectType = (entity: string): Props => ({ $Type: "DataTypes$ObjectType", entity });
export const listType = (entity: string): Props => ({ $Type: "DataTypes$ListType", entity });
export const stringType = (): Props => ({ $Type: "DataTypes$StringType" });

export function exposedEntity(entity: string, children: Props[] = [], type = "ExposedEntity"): Props {
  return { $Type: `MessageDefinitions$${type}`, $ID: newId("exp"), entity, exposedName: entity.split(".").pop(), children };
}

export function entityMessageDefinition(name: string, exposed: Props | null): Props {
  return { $Type: "MessageDefinitions$EntityMessageDefinition", $ID: newId("md"), name, exposedEntity: exposed };
}

export function messageDefinitionCollection(name: string, definitions: Props[] = []): MessageDefinitions.MessageDefinitionCollection {
  return {
    $Type: "MessageDefinitions$MessageDefinitionCollection",
    $ID: newId("mdc"),
    name,
    messageDefinitions: definitions,
  } as unknown as MessageDefinitions.MessageDefinitionCollection;
}

export function messageDefinition2(name: string, exposed: Props | null): MessageDefinitions.MessageDefinition2 {
  return { $Type: "MessageDefinitions$MessageDefinition2", $ID: newId("md2"), name, exposedEntity: exposed } as unknown as MessageDefinitions.MessageDefinition2;
}

export function namedParameter(type: string, name: string, parameterType: Props): Props {
  return { $Type: type, $ID: newId("par"), name, parameterType };
}

export function dataSetParameter(name: string, parameterType: Props, constraints: Props[] = []): Props {
  return { ...namedParameter("DataSets$DataSetParameter", name, parameterType), constraints, parameterTypeIsRange: false };
}

export const oqlSource = (query: string | null): Props => ({ $Type: "DataSets$OqlDataSetSource", $ID: newId("oql"), query, ignoreErrorsInQuery: false });

export function viewEntitySourceDocument(name: string, oql: string | null): DomainModels.ViewEntitySourceDocument {
  return { $Type: "DomainModels$ViewEntitySourceDocument", $ID: newId("ves"), name, documentation: "", oql } as unknown as DomainModels.ViewEntitySourceDocument;
}

export const javaSource =(columns: Props[]): Props => ({ $Type: "DataSets$JavaDataSetSource", $ID: newId("jds"), columns });

export function parameterAccess(parameterName: string, constraintTexts: string[] = []): Props {
  return {
    $Type: "DataSets$DataSetParameterAccess",
    $ID: newId("pa"),
    parameterName,
    constraintAccessList: constraintTexts.map((constraintText) => ({ $Type: "DataSets$DataSetConstraintAccess", constraintText, enabled: true })),
  };
}

export function dataSet(name: string, parameters: Props[], source: Props, accessList: Props[] = []): DataSets.DataSet {
  return {
    $Type: "DataSets$DataSet",
    $ID: newId("ds"),
    name,
    parameters,
    source,
    dataSetAccess: {
      $Type: "DataSets$DataSetAccess",
      moduleRoleAccessList: [{ $Type: "DataSets$DataSetModuleRoleAccess", moduleRole: "MyModule.User", parameterAccessList: accessList }],
    },
  } as unknown as DataSets.DataSet;
}

export const concreteEntity = (entity: string): Props => ({ $Type: "CodeActions$ConcreteEntityType", entity });
export const codeList = (parameter: Props): Props => ({ $Type: "CodeActions$ListType", parameter });

export function codeParameter(name: string, type: Props): Props {
  return { $Type: "JavaActions$JavaActionParameter", $ID: newId("cap"), name, actionParameterType: { $Type: "CodeActions$BasicParameterType", type } };
}

export function javaAction(name: string, parameters: Props[] = [], returnType: Props = { $Type: "CodeActions$VoidType" }): JavaActions.JavaAction {
  return {
    $Type: "JavaActions$JavaAction",
    $ID: newId("ja"),
    name,
    actionParameters: parameters,
    actionReturnType: returnType,
    actionTypeParameters: [],
  } as unknown as JavaActions.JavaAction;
}

export function javaScriptAction(name: string, parameters: Props[] = [], returnType: Props = { $Type: "CodeActions$VoidType" }): JavaScriptActions.JavaScriptAction {
  return { ...javaAction(name, parameters, returnType), $Type: "JavaScriptActions$JavaScriptAction" } as unknown as JavaScriptActions.JavaScriptAction;
}

// A published OData service of `entity`, with an OrderLine entity type and an association end.
export function publishedOData(entity: string) {
  return {
    $Type: "ODataPublish$PublishedODataService2",
    $ID: newId("pos"),
    name: "POS_Test",
    path: "odata/Order/v1",
    namespace: "Order",
    description: "",
    entityTypes: [
      {
        $Type: "ODataPublish$EntityType",
        entity,
        exposedName: "Order",
        childMembers: [{ $Type: "ODataPublish$PublishedAssociationEnd", association: "MyModule.Order_Customer", entity: "MyModule.Customer", exposedAssociationName: "Order_Customer" }],
      },
      { $Type: "ODataPublish$EntityType", entity: "MyModule.OrderLine", exposedName: "OrderLine", childMembers: [] },
    ],
    entitySets: [{ $Type: "ODataPublish$EntitySet", entityType: entity, exposedName: "Orders" }] as Props[],
  };
}

// A published REST service whose operation parameter is of type `entity` and calls `microflow`.
export function publishedRest(entityOrMicroflow: string) {
  const isEntity = !entityOrMicroflow.includes("ACT_");
  return {
    $Type: "Rest$PublishedRestService",
    $ID: newId("prs"),
    name: "PRS_Test",
    serviceName: "OrderService",
    path: "rest/order/v1",
    resources: [
      {
        $Type: "Rest$PublishedRestServiceResource",
        name: "Order",
        operations: [
          {
            $Type: "Rest$PublishedRestServiceOperation",
            path: "{Order}",
            microflow: isEntity ? "MyModule.ACT_Get" : entityOrMicroflow,
            parameters: [
              {
                $Type: "Rest$RestOperationParameter",
                name: "Order",
                type: isEntity ? { $Type: "DataTypes$ObjectType", entity: entityOrMicroflow } : { $Type: "DataTypes$StringType" },
              },
            ],
          },
        ],
      },
    ],
  };
}

// A published web service with one operation returning `entity`.
export function publishedWebService(entity: string) {
  return {
    $Type: "WebServices$PublishedWebService",
    $ID: newId("pws"),
    name: "PWS_Test",
    versionedServices: [
      {
        $Type: "WebServices$VersionedService",
        targetNamespace: "http://example.com/Order",
        operations: [
          {
            $Type: "WebServices$PublishedOperation",
            name: "GetOrder",
            entityExposedName: "Order",
            dataEntity: { $Type: "WebServices$DataEntity", entity, exposedName: "Order", exposedItemName: "Item", childMembers: [] },
            parameters: [],
          },
        ],
      },
    ],
  };
}
