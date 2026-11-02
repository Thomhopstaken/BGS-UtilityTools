import { describe, expect, it } from "vitest";
import {
  referencesQualifiedName,
  rewriteQualifiedNames,
  rewriteQualifiedNamesInUnit,
} from "../../../../EntityNameChanger/updaters/shared/qualifiedNameRewrite";

describe("referencesQualifiedName", () => {
  it.each([
    ["FROM MyModule.Order AS o", true],
    ["SELECT MyModule.Order.Total", true],
    ["FROM MyModule.OrderLine", false],
    ["o/MyModule.Order_Customer", false],
    ["x = 'MyModule.Order'", false],
    ["Other.MyModule.Order", false],
    ["", false],
  ])("%s -> %s", (value, expected) => {
    expect(referencesQualifiedName(value, "MyModule.Order")).toBe(expected);
  });
});

const OLD = "MyModule.Order";
const NEW = "MyModule.Purchase";
const RENAMES = new Map([
  [OLD, NEW],
  ["MyModule.ACT_Order", "MyModule.ACT_Purchase"],
  ["MyModule.ACT_Order.Order", "MyModule.ACT_Purchase.Purchase"],
  ["MyModule.SUB_Process.OrderList", "MyModule.SUB_Process.PurchaseList"],
]);
const rewrite = (value: string) => rewriteQualifiedNames(value, RENAMES);

describe("rewriteQualifiedNames", () => {
  it.each([
    // entity and members
    ["MyModule.Order", "MyModule.Purchase"],
    ["MyModule.Order.Name", "MyModule.Purchase.Name"],
    ["$Customer/MyModule.Order_Customer/MyModule.Order/Name", "$Customer/MyModule.Order_Customer/MyModule.Purchase/Name"],
    ["[MyModule.Order_Customer/MyModule.Customer/MyModule.Order = $Order]", "[MyModule.Order_Customer/MyModule.Customer/MyModule.Purchase = $Order]"],
    ["$Order/MyModule.Order.Total > 10 and $Line/MyModule.Order.Total < 5", "$Order/MyModule.Purchase.Total > 10 and $Line/MyModule.Purchase.Total < 5"],
    ["(MyModule.Order)", "(MyModule.Purchase)"],
    // documents and parameters
    ["MyModule.ACT_Order", "MyModule.ACT_Purchase"],
    ["MyModule.ACT_Order.Order", "MyModule.ACT_Purchase.Purchase"],
    ["MyModule.ACT_Order.Customer", "MyModule.ACT_Purchase.Customer"],
    ["MyModule.SUB_Process.OrderList", "MyModule.SUB_Process.PurchaseList"],
  ])("rewrites %s", (value, expected) => {
    expect(rewrite(value)).toBe(expected);
  });

  it.each([
    ["MyModule.OrderLine"],
    ["MyModule.OrderLine.Name"],
    ["MyModule.Order_Customer"],
    ["MyModule.ACT_OrderLine"],
    ["MyModule.SUB_Process"],
    ["MyModule.SUB_Process.Order"],
    ["Other.MyModule.Order"],
    ["$MyModule.Order"],
    ["XMyModule.Order"],
    ["OtherModule.Order"],
    ["'MyModule.Order'"],
    ["$x = 'it''s MyModule.Order'"],
    ["1.5 + 2"],
    ["Order"],
    [""],
  ])("leaves %s", (value) => {
    expect(rewrite(value)).toBe(value);
  });

  it("rewrites outside literals and keeps literals", () => {
    expect(rewrite("'MyModule.Order' + MyModule.Order.Name")).toBe("'MyModule.Order' + MyModule.Purchase.Name");
  });

  it("is case-sensitive", () => {
    expect(rewrite("mymodule.order")).toBe("mymodule.order");
  });

  it("does nothing without renames", () => {
    expect(rewriteQualifiedNames(OLD, new Map())).toBe(OLD);
  });
});

describe("rewriteQualifiedNamesInUnit", () => {
  it("rewrites string properties of nested elements and counts changes", () => {
    const create = { $Type: "Microflows$CreateObjectAction", entity: OLD, items: [] };
    const source = { $Type: "Microflows$DatabaseRetrieveSource", entity: OLD, xPathConstraint: `[${OLD}_Customer = $Customer]` };
    const call = {
      $Type: "Microflows$MicroflowCall",
      microflow: "MyModule.ACT_Order",
      parameterMappings: [{ $Type: "Microflows$MicroflowCallParameterMapping", parameter: "MyModule.ACT_Order.Order", argument: "$Order" }],
    };
    const returnType = { $Type: "DataTypes$ListType", entity: OLD };
    const unit = {
      $Type: "Microflows$Microflow",
      name: "ACT_Order",
      objectCollection: {
        objects: [
          { $Type: "Microflows$ActionActivity", action: create },
          { $Type: "Microflows$ActionActivity", action: { $Type: "Microflows$RetrieveAction", retrieveSource: source } },
          { $Type: "Microflows$ActionActivity", action: { $Type: "Microflows$MicroflowCallAction", microflowCall: call } },
        ],
      },
      microflowReturnType: returnType,
    };
    expect(rewriteQualifiedNamesInUnit(unit, RENAMES)).toBe(5);
    expect(create.entity).toBe(NEW);
    expect(source.entity).toBe(NEW);
    expect(source.xPathConstraint).toBe(`[${OLD}_Customer = $Customer]`);
    expect(call.microflow).toBe("MyModule.ACT_Purchase");
    expect(call.parameterMappings[0]).toMatchObject({ parameter: "MyModule.ACT_Purchase.Purchase", argument: "$Order" });
    expect(returnType.entity).toBe(NEW);
    expect(unit.name).toBe("ACT_Order");
  });

  it("rewrites string array items", () => {
    const unit = { $Type: "T", names: [OLD, "Other", `${OLD}.Name`] };
    expect(rewriteQualifiedNamesInUnit(unit, RENAMES)).toBe(2);
    expect(unit.names).toEqual([NEW, "Other", `${NEW}.Name`]);
  });

  it("skips $-prefixed properties", () => {
    const unit = { $Type: "T", $ID: OLD, $QualifiedName: OLD };
    expect(rewriteQualifiedNamesInUnit(unit, RENAMES)).toBe(0);
    expect(unit.$QualifiedName).toBe(OLD);
  });

  it("leaves a unit without references unchanged", () => {
    const unit = { $Type: "T", name: "Order", entity: "MyModule.OrderLine", count: 1, none: null };
    expect(rewriteQualifiedNamesInUnit(unit, RENAMES)).toBe(0);
    expect(unit).toEqual({ $Type: "T", name: "Order", entity: "MyModule.OrderLine", count: 1, none: null });
  });

  it("is idempotent", () => {
    const unit = { $Type: "T", entity: OLD };
    rewriteQualifiedNamesInUnit(unit, RENAMES);
    expect(rewriteQualifiedNamesInUnit(unit, RENAMES)).toBe(0);
    expect(unit.entity).toBe(NEW);
  });
});

describe("rewriteQualifiedNamesInUnit with onlyProperties", () => {
  it("rewrites only the listed properties, at any depth", () => {
    const unit = {
      $Type: "Rest$ConsumedRestService",
      openApiFile: { $Type: "Rest$OpenApiFile", content: "MyModule.Order" },
      operations: [
        {
          $Type: "Rest$RestOperation",
          body: { $Type: "Rest$JsonBody", value: "MyModule.Order" },
          root: { $Type: "ExportMappings$ExportObjectMappingElement", entity: "MyModule.Order", children: [] },
        },
      ],
    };
    expect(rewriteQualifiedNamesInUnit(unit, RENAMES, new Set(["entity"]))).toBe(1);
    expect(unit.operations[0].root.entity).toBe("MyModule.Purchase");
    expect(unit.openApiFile.content).toBe("MyModule.Order");
    expect(unit.operations[0].body.value).toBe("MyModule.Order");
  });

  it("rewrites listed string arrays too", () => {
    const unit = { $Type: "X$Y", parameter: ["MyModule.ACT_Order.Order"], other: ["MyModule.Order"] };
    expect(rewriteQualifiedNamesInUnit(unit, RENAMES, new Set(["parameter"]))).toBe(1);
    expect(unit).toEqual({ $Type: "X$Y", parameter: ["MyModule.ACT_Purchase.Purchase"], other: ["MyModule.Order"] });
  });
});
