import type { Primitives } from "@mendix/extensions-api";
import type { JobStep } from "../../shared/rename/RenameJob";
import { unitDisplayName } from "../../shared/rename/RenameJob";
import { BATCH_SIZE, chunk } from "../../shared/rename/RenamePlanner";
import { qualifiedNamePrefixes } from "../../shared/rename/rewrite/qualifiedNameRewrite";
import type { UnitAccess } from "../../shared/rename/types";
import type { UnitInfoCache } from "../../shared/rename/UnitInfoCache";
import type { PrefixJobState } from "./PrefixJobState";

// One document type to scan.
export type ScanSource = {
  readonly unitType: string;
  readonly access: UnitAccess<Primitives.UnitBase>;
};

export type MarketplaceScanDeps = {
  readonly sources: readonly ScanSource[];
  readonly unitInfos: UnitInfoCache;
  readonly state: PrefixJobState;
  readonly batchSize?: number;
};

// Read-only: loads the Marketplace modules' documents and records which candidates they reference. Marketplace
// modules are never changed, so those references can't be updated, and the plan skips those renames. Never saves.
export class MarketplaceScanStep implements JobStep {
  readonly title = "Checking Marketplace modules";
  private readonly deps: MarketplaceScanDeps;

  constructor(deps: MarketplaceScanDeps) {
    this.deps = deps;
  }

  async run(): Promise<true | string> {
    const { state } = this.deps;
    const candidates = new Set(state.candidates.map((d) => `${d.moduleName}.${d.name}`));
    if (candidates.size === 0 || state.marketplaceModules.size === 0) {
      console.info(`marketplace scan: nothing to check (${candidates.size} candidates, ${state.marketplaceModules.size} modules)`);
      return true;
    }
    try {
      let scanned = 0;
      for (const source of this.deps.sources) {
        scanned += await this.scan(source, candidates);
      }
      console.info(`marketplace scan: ${scanned} documents, ${state.marketplaceReferences.size} candidates referenced`);
      return true;
    } catch (error: unknown) {
      console.info(`marketplace scan failed: ${error}`);
      return `Could not check the Marketplace modules: ${error}`;
    }
  }

  private async scan(source: ScanSource, candidates: ReadonlySet<string>): Promise<number> {
    const { state } = this.deps;
    const infos = (await this.deps.unitInfos.get(source.access)).filter(
      (info) => info.$Type === source.unitType && info.moduleName !== undefined && state.marketplaceModules.has(info.moduleName),
    );
    for (const batch of chunk(infos, this.deps.batchSize ?? BATCH_SIZE)) {
      const byId = new Map(batch.map((info) => [info.$ID, info]));
      const units = await source.access.loadAll((info) => byId.has(info.$ID), byId.size);
      for (const unit of units) {
        const info = byId.get(unit.$ID);
        for (const prefix of qualifiedNamePrefixes(unit)) {
          if (candidates.has(prefix) && info !== undefined && !state.marketplaceReferences.has(prefix)) {
            console.info(`marketplace scan: ${unitDisplayName(info)} references ${prefix}`);
            state.marketplaceReferences.set(prefix, unitDisplayName(info));
          }
        }
      }
    }
    console.debug(`marketplace scan: ${infos.length} ${source.unitType} units`);
    return infos.length;
  }
}
