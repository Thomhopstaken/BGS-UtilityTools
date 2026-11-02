import type { Primitives } from "@mendix/extensions-api";

// What every rename job knows about its scope.
export type JobScope = {
  // App Store modules and System: never touched.
  readonly excludedModules: ReadonlySet<string>;
};

// A unit is in scope when it belongs to one of the app's own modules.
export function isInScope(info: Readonly<Primitives.UnitInfo>, scope: JobScope): boolean {
  return info.moduleName !== undefined && !scope.excludedModules.has(info.moduleName);
}
