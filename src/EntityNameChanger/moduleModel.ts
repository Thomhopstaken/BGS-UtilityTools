import * as Mx from "@mendix/extensions-api";

type DomainModelApi = Mx.ModelAccessWithComponent<Mx.IDomainModelApi, Mx.DomainModels.DomainModel>;
type UnitInfos = readonly Readonly<Mx.Primitives.UnitInfo>[];

export async function getEntities(
  domainModels: DomainModelApi,
  modulelist: readonly Readonly<Mx.Projects.Module>[],
  appStoreList: ReadonlySet<string>,
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
export function getAppstoreModuleNames(modulelist: readonly Readonly<Mx.Projects.Module>[]): Set<string> {
  const appStoreList = new Set<string>(["System"]);
  modulelist.forEach((module) => {
    if (module.fromAppStore) {
      appStoreList.add(module.name);
    }
  });
  console.debug(appStoreList);
  return appStoreList;
}

// The domain model and module an entity lives in, or null when its container is unknown.
export function getEntityLocation(
  entity: Mx.DomainModels.Entity,
  domainModels: UnitInfos,
): { domainModelId: string; moduleName: string } | null {
  const domainModelId = Mx.getContainer<Mx.DomainModels.DomainModel>(entity)?.$ID;
  const moduleName = domainModels.find((i) => i.$ID === domainModelId)?.moduleName;
  console.debug(`entity ${entity.name}: domain model ${domainModelId}, module ${moduleName}`);
  if (domainModelId === undefined || moduleName === undefined) {
    return null;
  }
  return { domainModelId, moduleName };
}

// Names of the entities in one domain model, from the pane's loaded entities (no API call).
export function getEntityNamesInDomainModel(entities: readonly Mx.DomainModels.Entity[], domainModelId: string): string[] {
  const names = entities.filter((e) => Mx.getContainer<Mx.DomainModels.DomainModel>(e)?.$ID === domainModelId).map((e) => e.name);
  console.debug(`domain model ${domainModelId}: ${names.length} entities loaded in the pane`);
  return names;
}

export function setQualifiedName(element: any, domainModels: UnitInfos): string {
  const dmID = Mx.getContainer<Mx.DomainModels.DomainModel>(element)?.$ID;
  const domainName = domainModels.find((i) => i.$ID === dmID)?.moduleName;
  return `${domainName}.${element.name}`;
}
