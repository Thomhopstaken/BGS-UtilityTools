import type * as Mx from "@mendix/extensions-api";
import type { PaneData } from "./NameChangerPane";
import { getAppstoreModuleNames } from "../shared/rename/modules";
import { groupEntitiesByModule } from "./entityPicker";

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
