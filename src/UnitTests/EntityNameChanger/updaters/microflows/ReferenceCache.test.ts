import type { DatabaseConnector, ExcelDataImporter, JavaActions, MLMappings, Rest, Workflows } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import {
  databaseQueryEntity,
  emptyFlowReferences,
  entityOfCodeActionType,
  entityOfDataType,
  excelTemplateEntity,
  javaActionSignature,
  mlOutputEntity,
  restOperationEntity,
  workflowContextEntity,
} from "../../../../EntityNameChanger/updaters/microflows/ReferenceCache";

function javaAction(returnType: object, parameters: { name: string; actionParameterType: object }[] = []) {
  return { actionReturnType: returnType, actionParameters: parameters } as unknown as JavaActions.JavaAction;
}

const concrete = (entity: string) => ({ $Type: "CodeActions$ConcreteEntityType", entity });
const parameterized = (typeParameter: string) => ({ $Type: "CodeActions$ParameterizedEntityType", typeParameter });
const list = (parameter: object) => ({ $Type: "CodeActions$ListType", parameter });

describe("emptyFlowReferences", () => {
  it("returns fresh empty sets", () => {
    const refs = emptyFlowReferences();
    refs.microflows.add("A.B");
    expect(emptyFlowReferences().microflows.size).toBe(0);
    expect(Object.keys(refs).sort()).toEqual(
      [
        "associations",
        "connectorActions",
        "databaseQueries",
        "excelTemplates",
        "javaActions",
        "javaScriptActions",
        "microflows",
        "mlMappings",
        "nanoflows",
        "restOperations",
        "workflows",
      ].sort(),
    );
  });
});

describe("entityOfDataType", () => {
  it("returns the entity of object and list types", () => {
    expect(entityOfDataType({ $Type: "DataTypes$ObjectType", entity: "M.Order" } as never)).toBe("M.Order");
    expect(entityOfDataType({ $Type: "DataTypes$ListType", entity: "M.Order" } as never)).toBe("M.Order");
  });

  it("returns null for other types and missing types", () => {
    expect(entityOfDataType({ $Type: "DataTypes$StringType" } as never)).toBeNull();
    expect(entityOfDataType(null)).toBeNull();
    expect(entityOfDataType(undefined)).toBeNull();
  });
});

describe("javaActionSignature", () => {
  it("reads a concrete entity return type", () => {
    expect(javaActionSignature(javaAction(concrete("M.Order")))).toEqual({
      returnEntity: "M.Order",
      returnTypeParameter: null,
      parameters: [],
    });
  });

  it("reads a list of a type parameter as return type", () => {
    const signature = javaActionSignature(javaAction(list(parameterized("T"))));
    expect(signature.returnEntity).toBeNull();
    expect(signature.returnTypeParameter).toBe("T");
  });

  it("reads a list of a concrete entity as return type", () => {
    expect(javaActionSignature(javaAction(list(concrete("M.Order")))).returnEntity).toBe("M.Order");
  });

  it("ignores non-entity return types", () => {
    const signature = javaActionSignature(javaAction({ $Type: "CodeActions$BooleanType" }));
    expect([signature.returnEntity, signature.returnTypeParameter]).toEqual([null, null]);
  });

  it("collects entity-type and typed parameters, skipping others", () => {
    const signature = javaActionSignature(
      javaAction({ $Type: "CodeActions$VoidType" }, [
        { name: "EntityType", actionParameterType: { $Type: "CodeActions$EntityTypeParameterType", typeParameter: "T" } },
        { name: "Input", actionParameterType: { $Type: "CodeActions$BasicParameterType", type: parameterized("T") } },
        { name: "Inputs", actionParameterType: { $Type: "CodeActions$BasicParameterType", type: list(parameterized("U")) } },
        { name: "Fixed", actionParameterType: { $Type: "CodeActions$BasicParameterType", type: concrete("M.Order") } },
        { name: "Text", actionParameterType: { $Type: "CodeActions$BasicParameterType", type: { $Type: "CodeActions$StringType" } } },
        { name: "Mf", actionParameterType: { $Type: "CodeActions$MicroflowParameterType" } },
      ]),
    );
    expect(signature.parameters).toEqual([
      { name: "EntityType", kind: "entityType", typeParameter: "T" },
      { name: "Input", kind: "typed", typeParameter: "T" },
      { name: "Inputs", kind: "typed", typeParameter: "U" },
    ]);
  });
});

describe("entityOfCodeActionType", () => {
  it("returns the entity of a concrete entity type or a list of one", () => {
    expect(entityOfCodeActionType(concrete("M.Order") as never)).toBe("M.Order");
    expect(entityOfCodeActionType(list(concrete("M.Order")) as never)).toBe("M.Order");
  });

  it("returns null for type parameters, primitives and missing types", () => {
    expect(entityOfCodeActionType(list(parameterized("T")) as never)).toBeNull();
    expect(entityOfCodeActionType({ $Type: "CodeActions$StringType" } as never)).toBeNull();
    expect(entityOfCodeActionType(null)).toBeNull();
    expect(entityOfCodeActionType(undefined)).toBeNull();
  });
});

describe("workflowContextEntity", () => {
  it("returns the context parameter entity or null", () => {
    expect(workflowContextEntity({ parameter: { entity: "M.Order" } } as unknown as Workflows.Workflow)).toBe("M.Order");
    expect(workflowContextEntity({ parameter: null } as unknown as Workflows.Workflow)).toBeNull();
  });
});

describe("restOperationEntity", () => {
  it("returns the root entity of implicit response mapping", () => {
    const operation = {
      responseHandling: { $Type: "Rest$ImplicitMappingResponseHandling", rootMappingElement: { entity: "M.Order" } },
    } as unknown as Rest.RestOperation;
    expect(restOperationEntity(operation)).toBe("M.Order");
  });

  it("returns null for other response handling", () => {
    const operation = { responseHandling: { $Type: "Rest$NoResponseHandling" } } as unknown as Rest.RestOperation;
    expect(restOperationEntity(operation)).toBeNull();
  });
});

describe("mlOutputEntity", () => {
  it("returns the output entity or null", () => {
    const mapping = (mlModelMappings: unknown) => ({ mlModelMappings }) as unknown as MLMappings.MLMappingDocument;
    expect(mlOutputEntity(mapping({ output: { entity: "M.Prediction" } }))).toBe("M.Prediction");
    expect(mlOutputEntity(mapping({ output: null }))).toBeNull();
    expect(mlOutputEntity(mapping(null))).toBeNull();
  });
});

describe("databaseQueryEntity", () => {
  const connection = {
    queries: [
      { name: "GetOrders", tableMappings: [{ entity: "M.Order" }, { entity: "M.Order" }] },
      { name: "Mixed", tableMappings: [{ entity: "M.Order" }, { entity: "M.Customer" }] },
      { name: "Update", tableMappings: [] },
    ],
  } as unknown as DatabaseConnector.DatabaseConnection;

  it("returns the single mapped entity of the query", () => {
    expect(databaseQueryEntity(connection, "GetOrders")).toBe("M.Order");
  });

  it("returns null for several, no mapped entities or a missing query", () => {
    expect(databaseQueryEntity(connection, "Mixed")).toBeNull();
    expect(databaseQueryEntity(connection, "Update")).toBeNull();
    expect(databaseQueryEntity(connection, "Missing")).toBeNull();
  });
});

describe("excelTemplateEntity", () => {
  const template = (contents: unknown) => ({ contents }) as unknown as ExcelDataImporter.Template;

  it("returns the CSV sheet entity", () => {
    expect(excelTemplateEntity(template({ $Type: "ExcelDataImporter$CSVTemplateContents", sheet: { entity: "M.Order" } }))).toBe("M.Order");
  });

  it("returns the one entity of all Excel sheets, else null", () => {
    const excel = (...entities: (string | null)[]) => template({ $Type: "ExcelDataImporter$ExcelTemplateContents", sheets: entities.map((entity) => ({ entity })) });
    expect(excelTemplateEntity(excel("M.Order", null, "M.Order"))).toBe("M.Order");
    expect(excelTemplateEntity(excel("M.Order", "M.Customer"))).toBeNull();
    expect(excelTemplateEntity(excel())).toBeNull();
    expect(excelTemplateEntity(template(null))).toBeNull();
  });
});
