import type { Primitives } from "@mendix/extensions-api";
import { isInScope, type RenameContext } from "./RenameContext";
import type { UnitUpdater } from "./types";
import type { UnitInfoCache } from "./UnitInfoCache";

// Units loaded per progress step; each batch is dropped after saving so memory stays bounded.
// Set to 1 to load every unit fresh after the previous one was saved.
export const BATCH_SIZE = 25;

export type PlannedBatch = {
  updater: UnitUpdater;
  infos: readonly Readonly<Primitives.UnitInfo>[];
  // 1-based position of the first and last unit of this batch, for the step title.
  first: number;
  last: number;
  total: number;
};

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) {
    throw new Error(`chunk size must be at least 1, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

// Uses only unit metadata, so planning loads no documents. Stubs are skipped entirely.
// With a cache, getUnitsInfo() is called once per model API.
export async function planBatches(
  updaters: readonly UnitUpdater[],
  context: RenameContext,
  batchSize: number = BATCH_SIZE,
  unitInfos?: UnitInfoCache,
): Promise<PlannedBatch[]> {
  const batches: PlannedBatch[] = [];
  for (const updater of updaters) {
    if (!updater.implemented) {
      console.info(`${updater.label}: not implemented yet, skipped`);
      continue;
    }
    const all = await (unitInfos === undefined ? updater.access.getUnitsInfo() : unitInfos.get(updater.access));
    const infos = all.filter(
      (info) => info.$Type === updater.unitType && isInScope(info, context),
    );
    console.info(`${updater.label}: ${infos.length} units in scope, batch size ${batchSize}`);
    let first = 1;
    for (const batch of chunk(infos, batchSize)) {
      batches.push({ updater, infos: batch, first, last: first + batch.length - 1, total: infos.length });
      first += batch.length;
    }
  }
  console.info(`planned ${batches.length} batches`);
  return batches;
}
