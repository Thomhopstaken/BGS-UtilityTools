import type { Primitives } from "@mendix/extensions-api";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult } from "../framework/types";

// Placeholder for a document type that is planned but not built yet; the planner never loads it.
export function createStubUpdater<TUnit extends Primitives.UnitBase>(
  label: string,
  unitType: string,
  access: UnitAccess<TUnit>,
  description: string,
): UnitUpdater<TUnit> {
  return {
    label,
    unitType,
    implemented: false,
    description,
    access,
    async update(_unit: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
      console.debug(`${label}: not implemented, ${info.moduleName}.${info.name} left unchanged`);
      return { ...UNCHANGED };
    },
  };
}
