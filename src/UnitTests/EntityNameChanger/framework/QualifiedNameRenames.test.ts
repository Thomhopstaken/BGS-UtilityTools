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

  it("returns the current name of a renamed document, other names unchanged", () => {
    const renames = new QualifiedNameRenames();
    renames.addDocument("M", "ACT_Order", "ACT_Purchase");
    expect(renames.current("M.ACT_Order")).toBe("M.ACT_Purchase");
    expect(renames.current("M.ACT_Customer")).toBe("M.ACT_Customer");
  });
});
