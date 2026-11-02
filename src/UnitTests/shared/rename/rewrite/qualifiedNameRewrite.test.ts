import { describe, expect, it } from "vitest";
import {
  findReferencedName,
  findReferencedNameInUnit,
  qualifiedNamePrefix,
  qualifiedNamePrefixes,
  referencesQualifiedName,
  rewriteQualifiedNames,
  rewriteQualifiedNamesInUnit,
} from "../../../../shared/rename/rewrite/qualifiedNameRewrite";

describe("findReferencedNameInUnit", () => {
  const names = new Map([["MyModule.ACT_Get", "MyModule.ACT_Fetch"]]);

  it("finds a referenced name in any element string or string array, as the rewrite sees them", () => {
    const unit = { $Type: "Microflows$Microflow", objects: [{ $Type: "Microflows$ActionActivity", tags: ["x", "MyModule.ACT_Get"] }] };
    expect(findReferencedNameInUnit(unit, names)).toBe("MyModule.ACT_Get");
  });

  it("returns null for literals, $-keys and objects without a $Type", () => {
    const unit = { $Type: "Microflows$Microflow", $ID: "MyModule.ACT_Get", note: "'MyModule.ACT_Get'", plain: { value: "MyModule.ACT_Get" } };
    expect(findReferencedNameInUnit(unit, names)).toBeNull();
  });
});

describe("findReferencedName", () => {
  const names = new Set(["MyModule.Order", "MyModule.ACT_Get.Order"]);

  it("finds a name, a member of it, or a renamed parameter", () => {
    expect(findReferencedName("MyModule.Order", names)).toBe("MyModule.Order");
    expect(findReferencedName("$x/MyModule.Order/Total", names)).toBe("MyModule.Order");
    expect(findReferencedName("MyModule.Order.Total", names)).toBe("MyModule.Order");
    expect(findReferencedName("MyModule.ACT_Get.Order", names)).toBe("MyModule.ACT_Get.Order");
  });

  it("ignores other names, literals and text without a dot", () => {
    expect(findReferencedName("MyModule.OrderLine", names)).toBeNull();
    expect(findReferencedName("'MyModule.Order'", names)).toBeNull();
    expect(findReferencedName("MyModule.ACT_Get.Other", names)).toBeNull();
    expect(findReferencedName("Order", names)).toBeNull();
  });

  it("agrees with referencesQualifiedName", () => {
    const values = ["MyModule.Order", "MyModule.OrderLine", "x MyModule.Order.A y", "'MyModule.Order'", "MyModule.ACT_Get.Order.X"];
    for (const value of values) {
      const expected = [...names].some((qname) => referencesQualifiedName(value, qname));
      expect(findReferencedName(value, names) !== null).toBe(expected);
    }
  });
});

describe("qualifiedNamePrefix", () => {
  it("keeps the first two segments", () => {
    expect(qualifiedNamePrefix("M.Doc.Param.X")).toBe("M.Doc");
    expect(qualifiedNamePrefix("M.Doc")).toBe("M.Doc");
    expect(qualifiedNamePrefix("Single")).toBe("Single");
  });
});

describe("qualifiedNamePrefixes", () => {
  it("collects the prefixes of every dotted name in every element, arrays included, outside literals", () => {
    const unit = {
      $Type: "Pages$Page",
      $ID: "M.Ignored",
      name: "Page",
      widgets: [
        { $Type: "Pages$DataView", entity: "M.Order", xPath: "[M.Order_Customer = $x] and Name = 'Lit.Eral'" },
        { $Type: "Pages$Button", targets: ["M.ACT_Get.Param", "plain"] },
      ],
      plain: { notAnElement: "Skipped.Name" },
    };
    expect([...qualifiedNamePrefixes(unit)].sort()).toEqual(["M.ACT_Get", "M.Order", "M.Order_Customer"]);
  });

  it("covers every unit the rewrite changes", () => {
    const renames = new Map([
      ["M.Order", "M.Purchase"],
      ["M.ACT_Get.Order", "M.ACT_Get.Purchase"],
    ]);
    const keyPrefixes = new Set([...renames.keys()].map(qualifiedNamePrefix));
    const units = [
      { $Type: "X$A", value: "$o/M.Order_Customer" },
      { $Type: "X$A", value: "M.Order.Total" },
      { $Type: "X$A", items: ["M.ACT_Get.Order"] },
      { $Type: "X$A", value: "'M.Order'" },
      { $Type: "X$A", value: "M.OrderLine" },
    ];
    for (const unit of units) {
      const indexed = [...qualifiedNamePrefixes(unit)].some((prefix) => keyPrefixes.has(prefix));
      const changed = rewriteQualifiedNamesInUnit(structuredClone(unit), renames) > 0;
      expect(changed && !indexed).toBe(false);
    }
  });
});

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

describe("allow-list keys scoped to an element type", () => {
  const renames = new Map([["M.CON_Host", "M.NEW_Host"]]);
  const unit = () => ({
    $Type: "Rest$ConsumedRestService",
    name: "CRS",
    values: [
      { $Type: "Rest$ConstantValue", value: "M.CON_Host" },
      { $Type: "Rest$StringValue", value: "M.CON_Host" },
    ],
  });

  it("rewrites a Type$Element.key entry on that element type only", () => {
    const root = unit();
    expect(rewriteQualifiedNamesInUnit(root, renames, new Set(["Rest$ConstantValue.value"]))).toBe(1);
    expect(root.values.map((v) => v.value)).toEqual(["M.NEW_Host", "M.CON_Host"]);
  });

  it("still allows a plain key on every element type", () => {
    const root = unit();
    expect(rewriteQualifiedNamesInUnit(root, renames, new Set(["value"]))).toBe(2);
  });
});

describe("findReferencedNameInUnit with onlyProperties", () => {
  const names = new Set(["M.ACT_Get"]);
  const unit = { $Type: "T", name: "U", documentation: "M.ACT_Get", items: [{ $Type: "Item", microflow: "M.ACT_Get.Param" }] };

  it("ignores names outside the allow-list", () => {
    expect(findReferencedNameInUnit(unit, names, new Set(["entity"]))).toBeNull();
  });

  it("finds names in allowed properties, typed keys included", () => {
    expect(findReferencedNameInUnit(unit, names, new Set(["microflow"]))).toBe("M.ACT_Get");
    expect(findReferencedNameInUnit(unit, names, new Set(["Item.microflow"]))).toBe("M.ACT_Get");
    expect(findReferencedNameInUnit(unit, names, new Set(["Other.microflow"]))).toBeNull();
  });
});
