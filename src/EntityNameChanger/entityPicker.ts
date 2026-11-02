import * as Mx from "@mendix/extensions-api";

type UnitInfos = readonly Readonly<Mx.Primitives.UnitInfo>[];

// One entity in the pane's pickers, as plain data.
export type EntityOption = {
  readonly id: string;
  readonly name: string;
  readonly moduleName: string;
  readonly domainModelId: string;
};

// Module name -> its entities sorted by name; modules sorted by name. Entities of an unknown domain model are left out.
export function groupEntitiesByModule(entities: readonly Mx.DomainModels.Entity[], unitInfos: UnitInfos): Map<string, EntityOption[]> {
  const moduleByDomainModel = new Map<string, string>();
  for (const info of unitInfos) {
    if (info.moduleName !== undefined) {
      moduleByDomainModel.set(info.$ID, info.moduleName);
    }
  }
  const byModule = new Map<string, EntityOption[]>();
  let skipped = 0;
  for (const entity of entities) {
    const domainModelId = Mx.getContainer<Mx.DomainModels.DomainModel>(entity)?.$ID;
    const moduleName = domainModelId === undefined ? undefined : moduleByDomainModel.get(domainModelId);
    if (domainModelId === undefined || moduleName === undefined) {
      console.debug(`entity ${entity.name}: module unknown, left out of the picker`);
      skipped++;
      continue;
    }
    const options = byModule.get(moduleName) ?? [];
    options.push({ id: entity.$ID, name: entity.name, moduleName, domainModelId });
    byModule.set(moduleName, options);
  }
  const sorted = new Map([...byModule.entries()].sort(([a], [b]) => compareNames(a, b)));
  for (const options of sorted.values()) {
    options.sort((a, b) => compareNames(a.name, b.name));
  }
  console.info(`entity picker: ${entities.length - skipped} entities in ${sorted.size} modules, ${skipped} left out`);
  return sorted;
}

// Ignores case and accents first; a full compare breaks ties so the order is stable.
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b, "en");
}

// The picker data with one entity renamed, its module's options sorted again; the rest is shared, not copied.
export function withRenamedEntity(
  byModule: ReadonlyMap<string, readonly EntityOption[]>,
  entityId: string,
  newName: string,
): Map<string, readonly EntityOption[]> {
  const result = new Map(byModule);
  for (const [moduleName, options] of byModule) {
    if (options.some((o) => o.id === entityId)) {
      const renamed = options.map((o) => (o.id === entityId ? { ...o, name: newName } : o));
      result.set(moduleName, renamed.sort((a, b) => compareNames(a.name, b.name)));
      console.debug(`entity picker: ${entityId} renamed to ${newName} in ${moduleName}`);
    }
  }
  return result;
}

// Every entity name in the app's own modules; used to protect longer names (OrderLine when renaming Order).
export function allEntityNames(byModule: ReadonlyMap<string, readonly EntityOption[]>): string[] {
  return [...byModule.values()].flatMap((options) => options.map((o) => o.name));
}
