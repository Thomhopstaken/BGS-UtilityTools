import type { JobReport } from "../../shared/rename/JobReport";
import type { QualifiedNameRenames } from "../../shared/rename/QualifiedNameRenames";
import type { JobStep } from "../../shared/rename/RenameJob";
import type { PrefixPlan } from "./PrefixPlan";

// After the renames: a planned rename that was not saved is dropped, so the reference pass keeps pointing to the old
// name, which still exists. Never stops the job.
export class RenameCheckStep implements JobStep {
  readonly title = "Checking renames";
  private readonly plan: PrefixPlan;
  private readonly renames: QualifiedNameRenames;

  constructor(plan: PrefixPlan, renames: QualifiedNameRenames) {
    this.plan = plan;
    this.renames = renames;
  }

  async run(report: JobReport): Promise<true | string> {
    const failed = new Set(report.failures.map((f) => f.unitId));
    let dropped = 0;
    for (const { document } of this.plan.all()) {
      if (report.wasChanged(document.$ID)) {
        continue;
      }
      this.renames.remove(`${document.moduleName}.${document.name}`);
      dropped++;
      if (!failed.has(document.$ID)) {
        // e.g. loadAll didn't return the unit.
        report.addError("Renames", document, "not renamed; references keep the old name");
      }
    }
    console.info(`rename check: ${this.plan.size - dropped} renamed, ${dropped} dropped from the reference pass`);
    return true;
  }
}
