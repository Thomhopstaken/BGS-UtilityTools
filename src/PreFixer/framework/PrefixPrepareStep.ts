import type { DomainModels, Security } from "@mendix/extensions-api";
import type { JobReport } from "../../shared/rename/JobReport";
import { isInScope, type JobScope } from "../../shared/rename/JobScope";
import type { JobStep } from "../../shared/rename/RenameJob";
import { renamableType } from "../documentTypes";
import { listDocuments, type TreeModule } from "../prefixModel";
import { type PrefixChange, prefixOf } from "../prefixRename";
import type { InModule } from "./domainNames";
import { collectReservedNames } from "./domainNames";
import type { PrefixJobState } from "./PrefixJobState";

const DOCUMENT_TEMPLATE = "DocumentTemplates$DocumentTemplate";

// Model calls the step makes; injected so tests can fake them.
export type PrefixPrepareDeps = {
  getModulesTree(): Promise<readonly TreeModule[]>;
  // Domain models and module security of the app's own modules.
  loadDomainModels(): Promise<readonly InModule<DomainModels.DomainModel>[]>;
  loadModuleSecurities(): Promise<readonly InModule<Security.ModuleSecurity>[]>;
  // Lists every model API the job uses: unit ids per unit type.
  listUnits(): Promise<ReadonlyMap<string, ReadonlySet<string>>>;
  readonly scope: JobScope;
  readonly change: PrefixChange;
  readonly state: PrefixJobState;
};

// First step: reads everything the plan needs and lists every model API, so a listing failure stops the job before
// anything is changed. Changes nothing.
export class PrefixPrepareStep implements JobStep {
  readonly title = "Preparing";
  private readonly deps: PrefixPrepareDeps;

  constructor(deps: PrefixPrepareDeps) {
    this.deps = deps;
  }

  async run(report: JobReport): Promise<true | string> {
    const { state, scope, change } = this.deps;
    try {
      const tree = await this.deps.getModulesTree();
      state.names.load(tree);
      state.marketplaceModules = new Set(tree.filter((m) => m.fromAppStore && m.name !== "System").map((m) => m.name));
      const own = listDocuments(tree).filter((document) => isInScope(document, scope));
      report.documentTemplates = own.filter((document) => document.$Type === DOCUMENT_TEMPLATE).length;
      state.candidates = own.filter(
        (document) => renamableType(document.$Type)?.group === change.group && prefixOf(document.name) === change.oldPrefix,
      );
      console.info(`prepare: ${state.candidates.length} candidates, ${state.marketplaceModules.size} Marketplace modules`);
      state.reservedNames = collectReservedNames(await this.deps.loadDomainModels(), await this.deps.loadModuleSecurities());
      state.listed = await this.deps.listUnits();
      return true;
    } catch (error: unknown) {
      console.info(`prepare failed: ${error}`);
      return `Could not prepare the rename: ${error}`;
    }
  }
}
