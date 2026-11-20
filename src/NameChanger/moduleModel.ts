import type * as Mx from "@mendix/extensions-api";
import type { PaneData } from "./NameChangerPane";
import { getAppstoreModuleNames } from "../shared/rename/modules";
import { type EntityOption, groupEntitiesByModule } from "./entityPicker";

type DomainModelApi = Mx.ModelAccessWithComponent<Mx.IDomainModelApi, Mx.DomainModels.DomainModel>;
type ModulesApi = Pick<Mx.IModuleApi, "getModules">;

// Entities of every domain model outside the excluded modules.
export async function getEntities(
  domainModels: DomainModelApi,
  modulelist: readonly Readonly<Mx.Projects.Module>[],
  appStoreList: ReadonlySet<string>,
): Promise<Mx.DomainModels.Entity[]> {
  // One domain model per module, so the own module count caps the units to load.
  const domainModelUnits = await domainModels.loadAll(
    (info: Mx.Primitives.UnitInfo) => info.moduleName !== undefined && !appStoreList.has(info.moduleName),
    modulelist.length - appStoreList.size,
  );
  const entities = domainModelUnits.flatMap((domainModel: Mx.DomainModels.DomainModel) => domainModel.entities);
  console.debug(`loaded ${domainModelUnits.length} domain models with ${entities.length} entities`);
  return entities;
}

// One module's entities for the entity picker; only its domain model is loaded.
export async function loadModuleEntities(domainModels: DomainModelApi, moduleName: string): Promise<EntityOption[]> {
  const started = Date.now();
  const units = await domainModels.loadAll((info: Mx.Primitives.UnitInfo) => info.moduleName === moduleName, 1);
  const entities = units.flatMap((domainModel: Mx.DomainModels.DomainModel) => domainModel.entities);
  const options = groupEntitiesByModule(entities, await domainModels.getUnitsInfo()).get(moduleName) ?? [];
  console.info(`entities of '${moduleName}' loaded in ${Date.now() - started} ms: ${options.length}`);
  return options;
}

// Everything the pane's pickers show: the app's own modules and their entities.
export async function loadPaneData(modules: ModulesApi, domainModels: DomainModelApi): Promise<PaneData> {
  const started = Date.now();
  const modulelist = await modules.getModules();
  const excludedModules = getAppstoreModuleNames(modulelist);
  const entities = await getEntities(domainModels, modulelist, excludedModules);
  const byModule = groupEntitiesByModule(entities, await domainModels.getUnitsInfo());
  console.info(`pane data loaded in ${Date.now() - started} ms`);
  return { excludedModules, byModule };
}
