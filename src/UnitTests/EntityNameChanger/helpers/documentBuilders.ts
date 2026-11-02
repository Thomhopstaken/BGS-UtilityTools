import type { ExportMappings, ImportMappings, JsonStructures, Workflows } from "@mendix/extensions-api";

// Test-only builders for workflows, mappings and JSON structures; plain objects cast to the Mendix types.

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
