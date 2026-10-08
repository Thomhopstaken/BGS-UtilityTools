import { describe, expect, it } from "vitest";
import { AssociationRenamePlan } from "../../../EntityNameChanger/framework/AssociationRenamePlan";

describe("AssociationRenamePlan", () => {
  it("starts empty", () => {
    const plan = new AssociationRenamePlan();
    expect(plan.count).toBe(0);
    expect(plan.has("dm-1")).toBe(false);
    expect(plan.get("dm-1").size).toBe(0);
  });

  it("keeps renames per domain model", () => {
    const plan = new AssociationRenamePlan();
    plan.set("dm-1", "a1", "Purchase_Customer");
    plan.set("dm-1", "a2", "Purchase_Invoice");
    plan.set("dm-2", "a3", "Invoice_Purchase");
    expect(plan.count).toBe(3);
    expect(plan.has("dm-1")).toBe(true);
    expect(plan.has("dm-3")).toBe(false);
    expect([...plan.get("dm-1")]).toEqual([
      ["a1", "Purchase_Customer"],
      ["a2", "Purchase_Invoice"],
    ]);
  });

  it("overwrites a rename of the same association", () => {
    const plan = new AssociationRenamePlan();
    plan.set("dm-1", "a1", "A");
    plan.set("dm-1", "a1", "B");
    expect(plan.count).toBe(1);
    expect(plan.get("dm-1").get("a1")).toBe("B");
  });
});
