import type { JobReport } from "../../shared/rename/JobReport";
import type { QualifiedNameRenames } from "../../shared/rename/QualifiedNameRenames";
import type { JobStep } from "../../shared/rename/RenameJob";
import type { PrefixChange } from "../prefixRename";
import type { PrefixJobState } from "./PrefixJobState";
import type { PrefixPlan } from "./PrefixPlan";
import { planPrefixRenames } from "./prefixPlanner";

export type PrefixPlanStepDeps = {
  readonly state: PrefixJobState;
  readonly change: PrefixChange;
  readonly plan: PrefixPlan;
  readonly renames: QualifiedNameRenames;
};

// Decides every rename from metadata (no model API calls) and records it; skipped documents go to the report.
// The gate before anything changes: errors so far stop the job. No renames is not an error; later steps are idle.
export class PrefixPlanStep implements JobStep {
  readonly title = "Planning renames";
  private readonly deps: PrefixPlanStepDeps;

  constructor(deps: PrefixPlanStepDeps) {
    this.deps = deps;
  }

  async run(report: JobReport): Promise<true | string> {
    if (report.hasErrors) {
      return `${report.failures.length} documents could not be checked; nothing was changed`;
    }
    const { state, change, plan, renames } = this.deps;
    const decisions = planPrefixRenames({
      candidates: state.candidates,
      change,
      names: state.names,
      reservedNames: state.reservedNames,
      marketplaceReferences: state.marketplaceReferences,
      listed: state.listed,
    });
    for (const decision of decisions) {
      const { document } = decision;
      if (decision.kind === "skip") {
        report.skipDocument(document, decision.reason, decision.newName ?? undefined);
      } else {
        plan.add(document, decision.newName);
        renames.addDocument(document.moduleName, document.name, decision.newName, document.$ID);
      }
    }
    console.info(`plan step: ${plan.size} renames planned, ${report.skippedDocuments.length} skipped`);
    return true;
  }
}
