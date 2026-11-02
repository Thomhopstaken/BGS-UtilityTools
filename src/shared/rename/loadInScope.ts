import type { Primitives } from "@mendix/extensions-api";
import { isInScope, type JobScope } from "./JobScope";
import { BATCH_SIZE, chunk } from "./RenamePlanner";
import type { UnitAccess } from "./types";
import type { UnitInfoCache } from "./UnitInfoCache";

export type LoadedUnit<TUnit> = {
  readonly info: Readonly<Primitives.UnitInfo>;
  readonly unit: TUnit;
};

// Every unit of one type in the app's own modules, with its info, for reading only. Loads in batches and always
// passes the count, as loadAll loads 10 units by default.
export async function loadInScope<TUnit extends Primitives.UnitBase>(
  access: UnitAccess<TUnit>,
  unitType: string,
  unitInfos: UnitInfoCache,
  scope: JobScope,
  batchSize: number = BATCH_SIZE,
): Promise<LoadedUnit<TUnit>[]> {
  const infos = (await unitInfos.get(access)).filter((info) => info.$Type === unitType && isInScope(info, scope));
  const loaded: LoadedUnit<TUnit>[] = [];
  for (const batch of chunk(infos, batchSize)) {
    const byId = new Map(batch.map((info) => [info.$ID, info]));
    for (const unit of await access.loadAll((info) => byId.has(info.$ID), byId.size)) {
      const info = byId.get(unit.$ID);
      if (info !== undefined) {
        loaded.push({ info, unit });
      }
    }
  }
  console.info(`loaded ${loaded.length} of ${infos.length} ${unitType} units in scope`);
  return loaded;
}
