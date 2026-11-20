import type { Primitives } from "@mendix/extensions-api";
import type { AppModel } from "../shared/rename/referenceTypes";
import type { CurrentNameLoader } from "../shared/rename/RenamedDocumentNames";
import type { UnitAccess } from "../shared/rename/types";
import { renamableType } from "./documentTypes";

// Loads renamed documents through their type's model API, for RenamedDocumentNames.verify: only the given $IDs.
export function currentNameLoader(model: Partial<AppModel>): CurrentNameLoader {
  return async (unitType, ids) => {
    const type = renamableType(unitType);
    if (type === undefined) {
      throw new Error(`no model API for ${unitType}`);
    }
    const access = model[type.api] as unknown as UnitAccess<Primitives.UnitBase> | undefined;
    if (access === undefined) {
      throw new Error(`model API ${type.api} not available`);
    }
    const started = Date.now();
    const units = await access.loadAll((info) => ids.has(info.$ID), ids.size);
    console.debug(`current names: ${units.length} of ${ids.size} ${type.api} loaded in ${Date.now() - started} ms`);
    return units.map((unit) => ({ $ID: unit.$ID, name: (unit as { name?: string }).name }));
  };
}
