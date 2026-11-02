import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { DataSetInspector } from "../../../../EntityNameChanger/updaters/documents/DataSetInspector";
import { NO_LOCAL_RENAMES } from "../../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import { dataSet, dataSetParameter, javaSource, objectType, oqlSource, parameterAccess, stringType } from "../../helpers/documentBuilders";
import { fakeContext } from "../../helpers/fakes";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
const inspector = new DataSetInspector(context, new NamingPolicy(context.oldName, context.newName, context.protectedNames));

const column = (name: string, columnType: Record<string, unknown>) => ({ $Type: "DataSets$DataSetColumn", name, columnType });

describe("DataSetInspector.usesEntity", () => {
  it("is true for a parameter of the entity's type, old or new name", () => {
    expect(inspector.usesEntity(dataSet("DS", [dataSetParameter("P", objectType("MyModule.Order"))], oqlSource(null)))).toBe(true);
    expect(inspector.usesEntity(dataSet("DS", [dataSetParameter("P", objectType("MyModule.Purchase"))], oqlSource(null)))).toBe(true);
  });

  it("is true for a Java source column of the entity's type", () => {
    expect(inspector.usesEntity(dataSet("DS", [], javaSource([column("C", objectType("MyModule.Order"))])))).toBe(true);
  });

  it("is true for a query using the entity or one of its members", () => {
    expect(inspector.usesEntity(dataSet("DS", [], oqlSource("SELECT o.Total FROM MyModule.Order AS o")))).toBe(true);
    expect(inspector.usesEntity(dataSet("DS", [], oqlSource("SELECT MyModule.Order.Total FROM X")))).toBe(true);
  });

  it("is false for other entities, literals and empty queries", () => {
    expect(inspector.usesEntity(dataSet("DS", [], oqlSource("SELECT * FROM MyModule.OrderLine WHERE x = 'MyModule.Order'")))).toBe(false);
    expect(inspector.usesEntity(dataSet("DS", [dataSetParameter("Order", stringType())], oqlSource(null)))).toBe(false);
    expect(inspector.usesEntity(dataSet("DS", [], javaSource([column("C", objectType("MyModule.Customer"))])))).toBe(false);
  });
});

describe("DataSetInspector.planLocalRenames", () => {
  it("renames parameters of the entity's type named after it, not for callers", () => {
    const ds = dataSet("DS", [dataSetParameter("Order", objectType("MyModule.Order")), dataSetParameter("OrderLine", objectType("MyModule.OrderLine"))], oqlSource(null));
    expect(inspector.planLocalRenames(ds)).toEqual({ renames: new Map([["Order", "Purchase"]]), referencedByCallers: false, skipped: 0 });
  });

  it("has nothing to rename without a matching parameter", () => {
    expect(inspector.planLocalRenames(dataSet("DS", [dataSetParameter("Order", stringType())], oqlSource(null)))).toBe(NO_LOCAL_RENAMES);
  });
});

describe("DataSetInspector.apply", () => {
  it("renames the parameter and its usages in query, constraints and access", () => {
    const constraint = { $Type: "DataSets$DataSetObjectConstraint", name: "C", constraint: "[id = $Order and x = '$Order']" };
    const parameter = dataSetParameter("Order", objectType("MyModule.Order"), [constraint]);
    const source = oqlSource("SELECT * FROM MyModule.Order o WHERE o.id = $Order AND o.l = $OrderLine");
    const access = parameterAccess("Order", ["[Owner = $Order]"]);
    const other = parameterAccess("OrderLine");
    const ds = dataSet("DS", [parameter], source, [access, other]);
    expect(inspector.apply(ds, inspector.planLocalRenames(ds))).toBe(5);
    expect(parameter.name).toBe("Purchase");
    expect(source.query).toBe("SELECT * FROM MyModule.Order o WHERE o.id = $Purchase AND o.l = $OrderLine");
    expect(constraint.constraint).toBe("[id = $Purchase and x = '$Order']");
    expect(access.parameterName).toBe("Purchase");
    expect((access.constraintAccessList as { constraintText: string }[])[0].constraintText).toBe("[Owner = $Purchase]");
    expect(other.parameterName).toBe("OrderLine");
  });

  it("changes nothing without local renames", () => {
    const source = oqlSource("SELECT * FROM X WHERE a = $Order");
    expect(inspector.apply(dataSet("DS", [], source), NO_LOCAL_RENAMES)).toBe(0);
    expect(source.query).toBe("SELECT * FROM X WHERE a = $Order");
  });
});
