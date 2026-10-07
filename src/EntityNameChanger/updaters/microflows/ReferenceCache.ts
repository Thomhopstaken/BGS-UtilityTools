import type { CodeActions, DataTypes, MLMappings, Rest, Workflows } from "@mendix/extensions-api";

// The two entity ends of an association, as stored in the model (UNVERIFIED: $ID or qualified name).
export type AssociationEnds = { parent: string; child: string };

// Qualified names referenced by a flow that must be resolved before detection.
export type FlowReferences = {
  associations: Set<string>;
  microflows: Set<string>;
  nanoflows: Set<string>;
  javaActions: Set<string>;
  javaScriptActions: Set<string>;
  workflows: Set<string>;
  restOperations: Set<string>;
  mlMappings: Set<string>;
};

export function emptyFlowReferences(): FlowReferences {
  return {
    associations: new Set<string>(),
    microflows: new Set<string>(),
    nanoflows: new Set<string>(),
    javaActions: new Set<string>(),
    javaScriptActions: new Set<string>(),
    workflows: new Set<string>(),
    restOperations: new Set<string>(),
    mlMappings: new Set<string>(),
  };
}

// A java or JavaScript action parameter that can bind a type parameter.
export type JavaActionParameterFact = {
  name: string;
  // entityType: an entity-type argument; typed: an object/list argument whose type uses the type parameter.
  kind: "entityType" | "typed";
  typeParameter: string | null;
};

export type JavaActionSignature = {
  returnEntity: string | null;
  returnTypeParameter: string | null;
  parameters: JavaActionParameterFact[];
};

// Facts about referenced documents by qualified name, kept for the whole job.
// Only small values are stored so the resolved documents themselves can be garbage-collected.
// Values: the entity qualified name involved, or null when there is none or the document was not found.
export class ReferenceCache {
  readonly associations = new Map<string, AssociationEnds | null>();
  readonly microflowReturnEntities = new Map<string, string | null>();
  readonly nanoflowReturnEntities = new Map<string, string | null>();
  readonly javaActions = new Map<string, JavaActionSignature | null>();
  readonly javaScriptActions = new Map<string, JavaActionSignature | null>();
  readonly workflowContextEntities = new Map<string, string | null>();
  readonly restOperationEntities = new Map<string, string | null>();
  readonly mlOutputEntities = new Map<string, string | null>();
}

// Entity of an object or list data type.
export function entityOfDataType(dataType: DataTypes.DataType | null | undefined): string | null {
  if (dataType === null || dataType === undefined) {
    return null;
  }
  return dataType.$Type === "DataTypes$ObjectType" || dataType.$Type === "DataTypes$ListType" ? dataType.entity : null;
}

// Java and JavaScript actions share the CodeAction signature.
export function javaActionSignature(javaAction: CodeActions.CodeAction): JavaActionSignature {
  const returnType = javaAction.actionReturnType;
  const entityType = returnType.$Type === "CodeActions$ListType" ? returnType.parameter : returnType;
  const signature: JavaActionSignature = { returnEntity: null, returnTypeParameter: null, parameters: [] };
  if (entityType.$Type === "CodeActions$ConcreteEntityType") {
    signature.returnEntity = entityType.entity;
  } else if (entityType.$Type === "CodeActions$ParameterizedEntityType") {
    signature.returnTypeParameter = entityType.typeParameter;
  }
  for (const parameter of javaAction.actionParameters) {
    const parameterType = parameter.actionParameterType;
    if (parameterType.$Type === "CodeActions$EntityTypeParameterType") {
      signature.parameters.push({ name: parameter.name, kind: "entityType", typeParameter: parameterType.typeParameter });
    } else if (parameterType.$Type === "CodeActions$BasicParameterType") {
      const typeParameter = typeParameterOf(parameterType.type);
      if (typeParameter !== null) {
        signature.parameters.push({ name: parameter.name, kind: "typed", typeParameter });
      }
    }
  }
  return signature;
}

function typeParameterOf(type: CodeActions.Type): string | null {
  const entityType = type.$Type === "CodeActions$ListType" ? type.parameter : type;
  return entityType.$Type === "CodeActions$ParameterizedEntityType" ? entityType.typeParameter : null;
}

// The workflow data object is the workflow's context parameter.
export function workflowContextEntity(workflow: Workflows.Workflow): string | null {
  return workflow.parameter?.entity ?? null;
}

export function restOperationEntity(operation: Rest.RestOperation): string | null {
  const response = operation.responseHandling;
  return response.$Type === "Rest$ImplicitMappingResponseHandling" ? response.rootMappingElement.entity : null;
}

export function mlOutputEntity(mapping: MLMappings.MLMappingDocument): string | null {
  return mapping.mlModelMappings?.output?.entity ?? null;
}
