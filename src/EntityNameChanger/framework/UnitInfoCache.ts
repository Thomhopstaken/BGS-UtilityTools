import type { Primitives } from "@mendix/extensions-api";
import type { UnitAccess } from "./types";

type UnitInfos = ReadonlyArray<Readonly<Primitives.UnitInfo>>;

// getUnitsInfo() once per model API within one job; several updaters share an API (plan, rename, references).
// Safe because ids, types and module names don't change during a job; names stay the original ones.
export class UnitInfoCache {
  private readonly infos = new Map<UnitAccess<Primitives.UnitBase>, Promise<UnitInfos>>();

  get(access: UnitAccess<Primitives.UnitBase>): Promise<UnitInfos> {
    let infos = this.infos.get(access);
    if (infos === undefined) {
      const started = Date.now();
      infos = access.getUnitsInfo().then(
        (result) => {
          console.info(`getUnitsInfo: ${result.length} units in ${Date.now() - started} ms`);
          return result;
        },
        (error: unknown) => {
          // Not cached, so a later step can try again.
          this.infos.delete(access);
          throw error;
        },
      );
      this.infos.set(access, infos);
    } else {
      console.debug("getUnitsInfo: cached");
    }
    return infos;
  }
}
