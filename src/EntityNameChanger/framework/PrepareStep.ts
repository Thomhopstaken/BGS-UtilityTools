import type { DocumentNameRegistry, DocumentTreeNode } from "./DocumentNameRegistry";
import type { EntityStep } from "./RenameJob";
import type { RenameReport } from "./RenameReport";

export type PrepareStepDeps = {
  // Fresh check of the entity and its new name; returns an error message or null.
  validate(): Promise<string | null>;
  getModulesTree(): Promise<readonly DocumentTreeNode[]>;
  // Empty until this step runs; shared with the updaters.
  documentNames: DocumentNameRegistry;
};

// First step in the progress dialog: the API work that used to delay opening the dialog. Changes nothing.
export class PrepareStep implements EntityStep {
  readonly title = "Preparing";
  private readonly deps: PrepareStepDeps;

  constructor(deps: PrepareStepDeps) {
    this.deps = deps;
  }

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
    return true;
  }
}
