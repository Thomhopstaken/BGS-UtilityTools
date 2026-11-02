import type { DataTypes, Microflows } from "@mendix/extensions-api";

// Test-only builders for microflow model shapes; plain objects cast to the Mendix types.

type Props = Record<string, unknown>;

let nextId = 0;
const newId = (prefix: string) => `${prefix}-${++nextId}`;

export function objectType(entity: string): DataTypes.DataType {
  return { $Type: "DataTypes$ObjectType", entity } as unknown as DataTypes.DataType;
}

export function listType(entity: string): DataTypes.DataType {
  return { $Type: "DataTypes$ListType", entity } as unknown as DataTypes.DataType;
}

export function stringType(): DataTypes.DataType {
  return { $Type: "DataTypes$StringType" } as unknown as DataTypes.DataType;
}

export function parameter(name: string, variableType: DataTypes.DataType, props: Props = {}): Microflows.MicroflowObject {
  return {
    $Type: "Microflows$MicroflowParameterObject",
    $ID: newId("param"),
    name,
    variableType,
    defaultValue: null,
    hasVariableNameBeenChanged: false,
    ...props,
  } as unknown as Microflows.MicroflowObject;
}

export function action(type: string, props: Props = {}): Props {
  return { $Type: `Microflows$${type}`, ...props };
}

export function activity(actionProps: Props | null, id: string = newId("activity")): Microflows.MicroflowObject {
  return { $Type: "Microflows$ActionActivity", $ID: id, action: actionProps } as unknown as Microflows.MicroflowObject;
}

export function loop(loopSource: Props, objects: Microflows.MicroflowObject[] = []): Microflows.MicroflowObject {
  return {
    $Type: "Microflows$LoopedActivity",
    $ID: newId("loop"),
    loopSource,
    objectCollection: { objects },
  } as unknown as Microflows.MicroflowObject;
}

export function iterableList(variableName: string, listVariableName: string): Props {
  return { $Type: "Microflows$IterableList", variableName, listVariableName };
}

export function microflowObject(type: string, props: Props = {}): Microflows.MicroflowObject {
  return { $Type: `Microflows$${type}`, $ID: newId(type), ...props } as unknown as Microflows.MicroflowObject;
}

export function sequenceFlow(origin: string, destination: string, caseValues: Props[] = []): Microflows.Flow {
  return { $Type: "Microflows$SequenceFlow", origin, destination, caseValues } as unknown as Microflows.Flow;
}

export type FlowSpec = {
  name?: string;
  objects?: Microflows.MicroflowObject[];
  flows?: Microflows.Flow[];
  // Defaults to one entry per top-level parameter object, like a microflow's parameters list.
  parameters?: { name: string }[];
  returnType?: DataTypes.DataType;
  returnVariableName?: string;
};

export function microflow(spec: FlowSpec = {}): Microflows.Microflow {
  const objects = spec.objects ?? [];
  const parameters =
    spec.parameters ??
    objects
      .filter((o) => o.$Type === "Microflows$MicroflowParameterObject")
      .map((o) => ({ name: (o as Microflows.MicroflowParameterObject).name }));
  return {
    $ID: newId("mf"),
    name: spec.name ?? "ACT_Test",
    objectCollection: { objects },
    flows: spec.flows ?? [],
    parameters,
    microflowReturnType: spec.returnType ?? { $Type: "DataTypes$VoidType" },
    returnVariableName: spec.returnVariableName ?? "",
  } as unknown as Microflows.Microflow;
}

export function template(...expressions: (string | null)[]): Props {
  return { arguments: expressions.map((expression) => ({ expression })) };
}

export function customRange(limitExpression: string | null, offsetExpression: string | null): Props {
  return { $Type: "Microflows$CustomRange", limitExpression, offsetExpression };
}
