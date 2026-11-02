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

  it("lists the Module.Name prefix of every key, cached until a change", () => {
    const renames = new QualifiedNameRenames();
    renames.addDocument("M", "ACT_Order", "ACT_Purchase");
    renames.addParameter("M", "ACT_Order", "ACT_Purchase", "Order", "Purchase");
    renames.addParameter("N", "Page", "Page", "Order", "Purchase");
    const prefixes = renames.prefixes();
    expect([...prefixes].sort()).toEqual(["M.ACT_Order", "N.Page"]);
    expect(renames.prefixes()).toBe(prefixes);
    renames.addAssociation("M", "Order_Customer", "Purchase_Customer");
    expect([...renames.prefixes()].sort()).toEqual(["M.ACT_Order", "M.Order_Customer", "N.Page"]);
    renames.remove("M.Order_Customer");
    expect([...renames.prefixes()].sort()).toEqual(["M.ACT_Order", "N.Page"]);
  });

  it("lists the documents whose parameters were renamed", () => {
    const renames = new QualifiedNameRenames();
    renames.add("M.Order", "M.Purchase");
    renames.addDocument("M", "ACT_Order", "ACT_Purchase");
    renames.addParameter("M", "ACT_Order", "ACT_Purchase", "Order", "Purchase");
    renames.addParameter("N", "Page", "Page", "Order", "Purchase");
    expect([...renames.parameterOwnerPrefixes()].sort()).toEqual(["M.ACT_Order", "N.Page"]);
  });

  it("lists as existing only renames whose declaring units were all saved", () => {
    const renames = QualifiedNameRenames.forEntity(fakeContext());
    renames.addDocument("MyModule", "ACT_Order", "ACT_Purchase", "mf-1");
    renames.addParameter("MyModule", "ACT_Order", "ACT_Purchase", "Order", "Purchase", "mf-1");
    renames.addAssociation("MyModule", "Order_Customer", "Purchase_Customer", "dm-2");
    // A document sharing the association's name.
    renames.addDocument("MyModule", "Order_Customer", "Purchase_Customer", "mf-2");
    renames.add("MyModule.Unknown", "MyModule.Known");
    const saved = new Set(["dm-1", "dm-2"]);
    expect([...renames.existing((id) => saved.has(id))]).toEqual([["MyModule.Order", "MyModule.Purchase"]]);
    saved.add("mf-2");
    expect([...renames.existing((id) => saved.has(id)).keys()]).toEqual(["MyModule.Order", "MyModule.Order_Customer"]);
    saved.add("mf-1");
    expect(renames.existing((id) => saved.has(id)).size).toBe(4);
  });

  it("forgets the declaring units of a removed rename", () => {
    const renames = new QualifiedNameRenames();
    renames.addDocument("M", "Order_Customer", "Purchase_Customer", "mf-1");
    renames.remove("M.Order_Customer");
    renames.add("M.Order_Customer", "M.Purchase_Customer", "dm-1");
    expect(renames.existing((id) => id === "dm-1").size).toBe(1);
  });

  it("updates the prefixes when retargeting drops a key", () => {
    const renames = new QualifiedNameRenames();
    renames.add("M.Doc.P", "M.Other.P");
    expect([...renames.prefixes()]).toEqual(["M.Doc"]);
    renames.retargetDocument("M", "Doc", "Other", "Doc");
    expect([...renames.prefixes()]).toEqual([]);
  });
});
