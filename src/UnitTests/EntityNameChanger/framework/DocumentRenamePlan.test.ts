import { describe, expect, it } from "vitest";
import { DocumentRenamePlan, qualifiedName } from "../../../EntityNameChanger/framework/DocumentRenamePlan";

describe("DocumentRenamePlan", () => {
  it("returns the planned rename by unit id", () => {
    const plan = new DocumentRenamePlan();
    plan.set("u1", { renamedTo: "ACT_Purchase", skipped: 0 });
    plan.set("u2", { renamedTo: null, skipped: 1 });
    expect(plan.get("u1")).toEqual({ renamedTo: "ACT_Purchase", skipped: 0 });
    expect(plan.get("u2")).toEqual({ renamedTo: null, skipped: 1 });
  });

  it("returns not renamed for an unplanned unit", () => {
    expect(new DocumentRenamePlan().get("missing")).toEqual({ renamedTo: null, skipped: 0 });
  });

  it("finds the unit id by original qualified name, renamed or not", () => {
    const plan = new DocumentRenamePlan();
    plan.set("u1", { renamedTo: "ACT_Purchase", skipped: 0 }, "M.ACT_Order");
    plan.set("u2", { renamedTo: null, skipped: 0 }, "M.ACT_Customer");
    plan.set("u3", { renamedTo: null, skipped: 0 });
    expect(plan.unitIdOf("M.ACT_Order")).toBe("u1");
    expect(plan.unitIdOf("M.ACT_Customer")).toBe("u2");
    expect(plan.unitIdOf("M.ACT_Purchase")).toBeUndefined();
  });

  it("overwrites a plan and keeps the index", () => {
    const plan = new DocumentRenamePlan();
    plan.set("u1", { renamedTo: null, skipped: 0 }, "M.Order_Customer");
    plan.set("u1", { renamedTo: "Purchase_Customer", skipped: 0 }, "M.Order_Customer");
    expect(plan.get("u1").renamedTo).toBe("Purchase_Customer");
    expect(plan.unitIdOf("M.Order_Customer")).toBe("u1");
  });
});

describe("qualifiedName", () => {
  it("needs a rename for marked work, a planned or skipped document rename, also when set late", () => {
    const plan = new DocumentRenamePlan();
    plan.set("work", { renamedTo: null, skipped: 0 });
    plan.markWork("work");
    plan.set("renamed", { renamedTo: "ACT_Purchase", skipped: 0 });
    plan.set("skipped", { renamedTo: null, skipped: 1 });
    plan.set("nothing", { renamedTo: null, skipped: 0 });
    expect(["work", "renamed", "skipped", "nothing", "unplanned"].map((id) => plan.needsRename(id))).toEqual([true, true, true, false, false]);
    plan.set("nothing", { renamedTo: "Purchase_Customer", skipped: 0 });
    expect(plan.needsRename("nothing")).toBe(true);
  });

  it("joins module and name, undefined without module", () => {
    expect(qualifiedName("M", "A")).toBe("M.A");
    expect(qualifiedName(undefined, "A")).toBeUndefined();
  });
});
