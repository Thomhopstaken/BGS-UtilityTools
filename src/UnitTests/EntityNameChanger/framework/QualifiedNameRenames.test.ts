import { describe, expect, it } from "vitest";
import { QualifiedNameRenames } from "../../../EntityNameChanger/framework/QualifiedNameRenames";
import { fakeContext } from "../helpers/fakes";

describe("QualifiedNameRenames", () => {
  it("starts empty", () => {
    const renames = new QualifiedNameRenames();
    expect(renames.size).toBe(0);
    expect([...renames.map]).toEqual([]);
  });

  it("adds plain, document and parameter renames", () => {
    const renames = new QualifiedNameRenames();
    renames.add("M.Order", "M.Purchase");
    renames.addDocument("M", "ACT_Order", "ACT_Purchase");
    renames.addParameter("M", "ACT_Order", "ACT_Purchase", "Order", "Purchase");
    expect([...renames.map]).toEqual([
      ["M.Order", "M.Purchase"],
      ["M.ACT_Order", "M.ACT_Purchase"],
      ["M.ACT_Order.Order", "M.ACT_Purchase.Purchase"],
    ]);
    expect(renames.size).toBe(3);
  });

  it("ignores a rename to the same name", () => {
    const renames = new QualifiedNameRenames();
    renames.add("M.Order", "M.Order");
    renames.addParameter("M", "SUB_Process", "SUB_Process", "Customer", "Customer");
    expect(renames.size).toBe(0);
  });

  it("keeps the document name in a parameter rename of a document that was not renamed", () => {
    const renames = new QualifiedNameRenames();
    renames.addParameter("M", "SUB_Process", "SUB_Process", "OrderList", "PurchaseList");
    expect([...renames.map]).toEqual([["M.SUB_Process.OrderList", "M.SUB_Process.PurchaseList"]]);
  });

  it("is seeded with the entity rename", () => {
    expect([...QualifiedNameRenames.forEntity(fakeContext()).map]).toEqual([["MyModule.Order", "MyModule.Purchase"]]);
  });

  it("adds and removes association renames", () => {
    const renames = new QualifiedNameRenames();
    renames.addAssociation("M", "Order_Customer", "Purchase_Customer");
    expect(renames.map.get("M.Order_Customer")).toBe("M.Purchase_Customer");
    renames.remove("M.Order_Customer");
    renames.remove("M.Missing");
    expect(renames.size).toBe(0);
  });

  it("retargets parameter renames to a document rename added late", () => {
    const renames = new QualifiedNameRenames();
    renames.addParameter("M", "Order_Customer", "Order_Customer", "OrderList", "PurchaseList");
    renames.addParameter("M", "Other", "Other", "OrderList", "PurchaseList");
    renames.retargetDocument("M", "Order_Customer", "Order_Customer", "Purchase_Customer");
    expect([...renames.map]).toEqual([
      ["M.Order_Customer.OrderList", "M.Purchase_Customer.PurchaseList"],
      ["M.Other.OrderList", "M.Other.PurchaseList"],
    ]);
  });

  it("retargets parameter renames back when a document rename is revoked", () => {
    const renames = new QualifiedNameRenames();
    renames.addDocument("M", "Order_Customer", "Purchase_Customer");
    renames.addParameter("M", "Order_Customer", "Purchase_Customer", "OrderList", "PurchaseList");
    renames.remove("M.Order_Customer");
    renames.retargetDocument("M", "Order_Customer", "Purchase_Customer", "Order_Customer");
    expect([...renames.map]).toEqual([["M.Order_Customer.OrderList", "M.Order_Customer.PurchaseList"]]);
  });

  it("drops a parameter rename that becomes a no-op after retargeting", () => {
    const renames = new QualifiedNameRenames();
    renames.add("M.Doc.P", "M.Other.P");
    renames.retargetDocument("M", "Doc", "Other", "Doc");
    expect(renames.size).toBe(0);
  });

  it("returns the current name of a renamed document, other names unchanged", () => {
    const renames = new QualifiedNameRenames();
    renames.addDocument("M", "ACT_Order", "ACT_Purchase");
    expect(renames.current("M.ACT_Order")).toBe("M.ACT_Purchase");
    expect(renames.current("M.ACT_Customer")).toBe("M.ACT_Customer");
  });
});
