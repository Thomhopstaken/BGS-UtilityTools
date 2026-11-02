import { describe, expect, it } from "vitest";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { ReferenceIndex } from "../../../shared/rename/ReferenceIndex";

const flow = (...expressions: string[]) => ({
  $Type: "Microflows$Microflow",
  objects: expressions.map((expression) => ({ $Type: "Microflows$ActionActivity", expression })),
});

describe("ReferenceIndex", () => {
  it("always accepts units it did not index", () => {
    const index = new ReferenceIndex();
    expect(index.covers("u1")).toBe(false);
    expect(index.mayReference("u1", new QualifiedNameRenames())).toBe(true);
  });

  it("accepts an indexed unit only when it references a renamed name or a member of one", () => {
    const index = new ReferenceIndex();
    index.add("entity", flow("$Order/MyModule.Order_Customer", "MyModule.Order.Total"));
    index.add("doc", flow("MyModule.ACT_Order_Get"));
    index.add("none", flow("MyModule.OrderLine", "'MyModule.Order'"));
    const renames = new QualifiedNameRenames();
    renames.add("MyModule.Order", "MyModule.Purchase");
    expect(index.size).toBe(3);
    expect(index.covers("entity")).toBe(true);
    expect(["entity", "doc", "none"].map((id) => index.mayReference(id, renames))).toEqual([true, false, false]);
  });

  it("matches parameter renames by their document", () => {
    const index = new ReferenceIndex();
    index.add("caller", flow("MyModule.ACT_Order_Get.Order"));
    const renames = new QualifiedNameRenames();
    renames.addParameter("MyModule", "ACT_Order_Get", "ACT_Order_Get", "Order", "Purchase");
    expect(index.mayReference("caller", renames)).toBe(true);
  });

  it("remembers units marked up to date", () => {
    const index = new ReferenceIndex();
    index.add("doc", flow("MyModule.Order"));
    expect(index.isUpToDate("doc")).toBe(false);
    index.markUpToDate("doc");
    expect(index.isUpToDate("doc")).toBe(true);
    expect(index.isUpToDate("other")).toBe(false);
  });

  it("tells whether a unit referenced any of some prefixes; unindexed units always", () => {
    const index = new ReferenceIndex();
    index.add("caller", flow("MyModule.ACT_Save.Order"));
    index.add("other", flow("MyModule.Order"));
    const prefixes = new Set(["MyModule.ACT_Save"]);
    expect(["caller", "other", "never"].map((id) => index.referencesAnyOf(id, prefixes))).toEqual([true, false, true]);
    expect(index.referencesAnyOf("caller", new Set())).toBe(false);
  });

  it("follows later changes to the renames", () => {
    const index = new ReferenceIndex();
    index.add("doc", flow("MyModule.ACT_Order_Get"));
    const renames = new QualifiedNameRenames();
    renames.add("MyModule.Order", "MyModule.Purchase");
    expect(index.mayReference("doc", renames)).toBe(false);
    renames.addDocument("MyModule", "ACT_Order_Get", "ACT_Purchase_Get");
    expect(index.mayReference("doc", renames)).toBe(true);
    renames.remove("MyModule.ACT_Order_Get");
    expect(index.mayReference("doc", renames)).toBe(false);
  });
});
