import { describe, expect, it } from "vitest";
import { getProtectedNames, NamingPolicy } from "../../../EntityNameChanger/framework/NamingPolicy";

describe("NamingPolicy", () => {
  it("renames a single occurrence", () => {
    const naming = new NamingPolicy("Order", "Purchase", []);
    expect(naming.rename("GetOrder")).toBe("GetPurchase");
    expect(naming.contains("GetOrder")).toBe(true);
  });

  it("renames every occurrence", () => {
    const naming = new NamingPolicy("Order", "Purchase", []);
    expect(naming.rename("OrderToOrder")).toBe("PurchaseToPurchase");
  });

  it("leaves names without the old name unchanged", () => {
    const naming = new NamingPolicy("Order", "Purchase", []);
    expect(naming.rename("GetCustomer")).toBe("GetCustomer");
    expect(naming.contains("GetCustomer")).toBe(false);
  });

  it("matches exact case only", () => {
    const naming = new NamingPolicy("Order", "Purchase", []);
    expect(naming.rename("order_list")).toBe("order_list");
    expect(naming.contains("ORDER")).toBe(false);
  });

  it("skips occurrences inside protected names", () => {
    const naming = new NamingPolicy("Order", "Purchase", ["OrderLine", "PurchaseOrder"]);
    expect(naming.rename("OrderLine_Create")).toBe("OrderLine_Create");
    expect(naming.rename("PurchaseOrder_Get")).toBe("PurchaseOrder_Get");
    expect(naming.rename("Order_OrderLine")).toBe("Purchase_OrderLine");
    expect(naming.contains("OrderLine")).toBe(false);
  });

  it("protects a new name that contains the old name, so a rerun is idempotent", () => {
    const naming = new NamingPolicy("Order", "OrderItem", []);
    expect(naming.protectedNames).toEqual(["OrderItem"]);
    const once = naming.rename("GetOrder");
    expect(once).toBe("GetOrderItem");
    expect(naming.rename(once)).toBe(once);
  });

  it("does not add the new name to protected names when it does not contain the old name", () => {
    expect(new NamingPolicy("Order", "Purchase", ["OrderLine"]).protectedNames).toEqual(["OrderLine"]);
  });

  it("never matches an empty old name", () => {
    const naming = new NamingPolicy("", "Purchase", []);
    expect(naming.contains("Anything")).toBe(false);
    expect(naming.rename("Anything")).toBe("Anything");
  });

  it("does not match overlapping occurrences twice", () => {
    const naming = new NamingPolicy("aa", "b", []);
    expect(naming.rename("aaa")).toBe("ba");
  });
});

describe("getProtectedNames", () => {
  it("returns other entity names containing the old name, deduplicated", () => {
    expect(getProtectedNames(["Order", "OrderLine", "PurchaseOrder", "Customer", "OrderLine"], "Order")).toEqual([
      "OrderLine",
      "PurchaseOrder",
    ]);
  });

  it("returns nothing for an empty old name", () => {
    expect(getProtectedNames(["Order"], "")).toEqual([]);
  });
});
