import * as Mx from "@mendix/extensions-api";

export async function getEntities(
  domainModels: any,
  modulelist: any,
  appStoreList: any,
): Promise<Mx.DomainModels.Entity[]> {
  const DomainModelUnits = await domainModels.loadAll(
    (info: Mx.Primitives.UnitInfo) => info.moduleName !== undefined && !appStoreList.has(info.moduleName),
    modulelist.length - appStoreList.size,
  );
  console.log(DomainModelUnits);

  const entities: Mx.DomainModels.Entity[] = [];
  DomainModelUnits.forEach((domainModel: Mx.DomainModels.DomainModel) => {
    entities.push(...domainModel.entities);
  });
  console.log(entities);
  return entities;
}
export function getAppstoreModuleNames(modulelist: any): Set<string> {
  const appStoreList = new Set<string>(["System"]);
  modulelist.forEach((module: any) => {
    if (module.fromAppStore) {
      appStoreList.add(module.name);
    }
  });
  console.debug(appStoreList);
  return appStoreList;
}

export function setQualifiedName(element: any, domainModels: readonly Readonly<Mx.Primitives.UnitInfo>[]): string {
  const dmID = Mx.getContainer<Mx.DomainModels.DomainModel>(element)?.$ID;
  const domainName = domainModels.find((i) => i.$ID === dmID)?.moduleName;
  return `${domainName}.${element.name}`;
}
