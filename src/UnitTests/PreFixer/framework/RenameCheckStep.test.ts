import { describe, expect, it } from "vitest";
import { PrefixPlan } from "../../../PreFixer/framework/PrefixPlan";
import { RenameCheckStep } from "../../../PreFixer/framework/RenameCheckStep";
import { JobReport } from "../../../shared/rename/JobReport";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { changed } from "../../shared/helpers/fakes";
import { appDocument, MF } from "../helpers/fakeModel";

const saved = appDocument("a", MF, "ACT_A_Save");
const failed = appDocument("b", MF, "ACT_B_Save");
const missing = appDocument("c", MF, "ACT_C_Save");

function setup() {
  const plan = new PrefixPlan();
  const renames = new QualifiedNameRenames();
  for (const document of [saved, failed, missing]) {
    plan.add(document, document.name.replace("ACT_", "SUB_"));
    renames.addDocument("M", document.name, document.name.replace("ACT_", "SUB_"), document.$ID);
  }
  return { plan, renames, step: new RenameCheckStep(plan, renames) };
}

describe("RenameCheckStep", () => {
  it("drops renames that were not saved and keeps the saved ones", async () => {
    const { renames, step } = setup();
    const report = new JobReport();
    report.addResult("Rename microflows", saved, changed({ renamedTo: "SUB_A_Save" }));
    report.addError("Rename microflows", failed, "save failed");
    expect(await step.run(report)).toBe(true);
    expect([...renames.map.keys()]).toEqual(["M.ACT_A_Save"]);
  });

  it("adds one failure for a rename that silently didn't happen, none for one that already failed", async () => {
    const { step } = setup();
    const report = new JobReport();
    report.addResult("Rename microflows", saved, changed({ renamedTo: "SUB_A_Save" }));
    report.addError("Rename microflows", failed, "save failed");
    await step.run(report);
    expect(report.failures.map((f) => [f.unitId, f.label, f.error])).toEqual([
      ["b", "Rename microflows", "save failed"],
      ["c", "Renames", "not renamed; references keep the old name"],
    ]);
  });

  it("never stops the job", async () => {
    const { step } = setup();
    expect(await step.run(new JobReport())).toBe(true);
  });
});
