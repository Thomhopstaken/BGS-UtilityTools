import { DomainModels, Primitives, Microflows } from "@mendix/extensions-api";

export async function getEntities(
  domainModels: any,
  modules: any,
): Promise<DomainModels.Entity[]> {
  const modulelist = await modules.getModules();
  const appStoreList = getAppstoreModuleNames(modulelist);

  const DomainModelUnits = await domainModels.loadAll(
    (info: Primitives.UnitInfo) =>
      info.moduleName !== undefined && !appStoreList.has(info.moduleName),
    modulelist.length - appStoreList.size,
  );
  console.log(DomainModelUnits);

  const entities: DomainModels.Entity[] = [];
  DomainModelUnits.forEach((domainModel: DomainModels.DomainModel) => {
    entities.push(...domainModel.entities);
  });
  console.log(entities);
  return entities;
}

function getAppstoreModuleNames(modulelist: any): Set<string> {
  const appStoreList = new Set<string>(["System"]);
  modulelist.forEach((module: any) => {
    if (module.fromAppStore) {
      appStoreList.add(module.name);
    }
  });
  console.trace(appStoreList);
  return appStoreList;
}

export function getActionActivities(
  collection: Microflows.MicroflowObjectCollection,
): Microflows.ActionActivity[] {
  const result: Microflows.ActionActivity[] = [];
  for (const obj of collection.objects) {
    if (obj.$Type === "Microflows$ActionActivity") {
      result.push(obj);
    } else if (obj.$Type === "Microflows$LoopedActivity") {
      result.push(...getActionActivities(obj.objectCollection));
    }
  }
  return result;
}
