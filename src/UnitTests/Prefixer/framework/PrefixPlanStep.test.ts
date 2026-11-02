import { describe, expect, it } from "vitest";
import { PrefixJobState } from "../../../Prefixer/framework/PrefixJobState";
import { PrefixPlan } from "../../../Prefixer/framework/PrefixPlan";
import { PrefixPlanStep } from "../../../Prefixer/framework/PrefixPlanStep";
import { JobReport } from "../../../shared/rename/JobReport";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { fakeUnitInfo } from "../../shared/helpers/fakes";
import { appDocument, MF } from "../helpers/fakeModel";

function setup() {
  const state = new PrefixJobState();
  const save = appDocument("mf-1", MF, "ACT_Order_Save");
  const show = appDocument("mf-2", MF, "ACT_Order_Show");
  state.candidates = [save, show];
  state.names.load([{ name: "M", documents: [{ name: "ACT_Order_Save" }, { name: "ACT_Order_Show" }, { name: "SUB_Order_Show" }] }]);
  state.listed = new Map([[MF, new Set(["mf-1", "mf-2"])]]);
  const plan = new PrefixPlan();
  const renames = new QualifiedNameRenames();
  const step = new PrefixPlanStep({ state, change: { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" }, plan, renames });
  return { step, plan, renames };
}

describe("PrefixPlanStep", () => {
  it("plans renames with their declaring unit and reports skipped documents", async () => {
    const { step, plan, renames } = setup();
    const report = new JobReport();
    expect(await step.run(report)).toBe(true);
    expect(plan.all().map((p) => [p.document.$ID, p.newName])).toEqual([["mf-1", "SUB_Order_Save"]]);
    expect([...renames.map]).toEqual([["M.ACT_Order_Save", "M.SUB_Order_Save"]]);
    expect(renames.existing((id) => id === "mf-1").size).toBe(1);
    expect(report.skippedDocuments).toEqual([
      { unitId: "mf-2", unitType: MF, qualifiedName: "M.ACT_Order_Show", newQualifiedName: "M.SUB_Order_Show", reason: "M.SUB_Order_Show already exists" },
    ]);
  });

  it("succeeds with nothing to rename", async () => {
    const plan = new PrefixPlan();
    const renames = new QualifiedNameRenames();
    const empty = new PrefixPlanStep({ state: new PrefixJobState(), change: { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" }, plan, renames });
    expect(await empty.run(new JobReport())).toBe(true);
    expect(plan.size).toBe(0);
    expect(renames.size).toBe(0);
  });

  it("stops before anything changes when earlier steps reported errors", async () => {
    const { step, plan } = setup();
    const report = new JobReport();
    report.addError("Preparing", fakeUnitInfo("x", MF), "boom");
    expect(await step.run(report)).toBe("1 documents could not be checked; nothing was changed");
    expect(plan.size).toBe(0);
  });
});
