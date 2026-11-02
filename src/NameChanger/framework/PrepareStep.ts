import type { DocumentNameRegistry, DocumentTreeNode } from "../../shared/rename/DocumentNameRegistry";
import type { JobStep } from "../../shared/rename/RenameJob";
import type { RenameReport } from "./RenameReport";

// Model calls the step makes; injected so tests can fake them.
export type PrepareStepDeps = {
  // Fresh check of the entity and its new name; returns an error message or null.
  validate(): Promise<string | null>;
  getModulesTree(): Promise<readonly DocumentTreeNode[]>;
  // Document templates in the app's own modules; listed only, never loaded.
  countDocumentTemplates(): Promise<number>;
  // Empty until this step runs; shared with the updaters.
  documentNames: DocumentNameRegistry;
};

// First step in the progress dialog: the API work that used to delay opening the dialog. Changes nothing.
export class PrepareStep implements JobStep<RenameReport> {
  readonly title = "Preparing";
  private readonly deps: PrepareStepDeps;

  constructor(deps: PrepareStepDeps) {
    this.deps = deps;
  }

  // Returns the validation problem, which stops the job, or true.
  async run(report: RenameReport): Promise<true | string> {
    let started = Date.now();
    const problem = await this.deps.validate();
    console.info(`prepare: validated in ${Date.now() - started} ms`);
    if (problem !== null) {
      report.skipEntity(problem);
      return problem;
    }
    started = Date.now();
    this.deps.documentNames.load(await this.deps.getModulesTree());
    console.info(`prepare: document names loaded in ${Date.now() - started} ms`);
    await this.countDocumentTemplates(report);
    return true;
  }

  // Document templates are skipped; the count only drives a run log warning, so a failure does not stop the job.
  private async countDocumentTemplates(report: RenameReport): Promise<void> {
    try {
      report.documentTemplates = await this.deps.countDocumentTemplates();
      console.info(`prepare: ${report.documentTemplates} document templates, not updated`);
    } catch (error: unknown) {
      report.documentTemplates = null;
      console.info(`prepare: could not list document templates: ${error}`);
    }
  }
}
