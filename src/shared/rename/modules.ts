// What getAppstoreModuleNames reads of a module; projects.getModules() and getModulesTree() both fit.
export type ModuleOrigin = {
  readonly name: string;
  readonly fromAppStore: boolean;
};

// App Store modules plus System: the modules a rename never touches.
export function getAppstoreModuleNames(modulelist: readonly ModuleOrigin[]): Set<string> {
  const appStoreList = new Set<string>(["System"]);
  modulelist.forEach((module) => {
    if (module.fromAppStore) {
      appStoreList.add(module.name);
    }
  });
  console.debug(`excluded modules: ${[...appStoreList].join(", ")}`);
  return appStoreList;
}
