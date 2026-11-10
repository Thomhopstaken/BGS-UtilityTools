import { describe, expect, it } from "vitest";
import { PrefixPlan } from "../../../PreFixer/framework/PrefixPlan";
import { appDocument, MF, NF } from "../helpers/fakeModel";

describe("PrefixPlan", () => {
  it("starts empty", () => {
    const plan = new PrefixPlan();
    expect(plan.size).toBe(0);
    expect(plan.has("x")).toBe(false);
    expect(plan.get("x")).toBeUndefined();
    expect(plan.countOf(MF)).toBe(0);
    expect(plan.all()).toEqual([]);
  });

  it("keeps renames per unit and counts them per type", () => {
    const plan = new PrefixPlan();
    const a = appDocument("a", MF, "ACT_A_B");
    plan.add(a, "SUB_A_B");
    plan.add(appDocument("b", MF, "ACT_C_D"), "SUB_C_D");
    plan.add(appDocument("c", NF, "ACT_E_F"), "SUB_E_F");
    expect(plan.size).toBe(3);
    expect(plan.get("a")).toEqual({ document: a, newName: "SUB_A_B" });
    expect(plan.countOf(MF)).toBe(2);
    expect(plan.countOf(NF)).toBe(1);
    expect(plan.all().map((p) => p.newName)).toEqual(["SUB_A_B", "SUB_C_D", "SUB_E_F"]);
  });
});
