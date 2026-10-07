import { describe, expect, it } from "vitest";
import { DocumentRenamePlan } from "../../../EntityNameChanger/framework/DocumentRenamePlan";

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
});
