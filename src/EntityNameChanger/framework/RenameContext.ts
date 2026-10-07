import type { Primitives } from "@mendix/extensions-api";
import { getProtectedNames } from "./NamingPolicy";

// Everything a rename job needs to know about the entity, as plain data.
export type RenameContext = {
  readonly entityId: string;
  readonly domainModelId: string;
  readonly moduleName: string;
  readonly oldName: string;
  readonly newName: string;
  // Qualified name before the rename; model references use this until the entity itself is renamed.
  readonly oldQualifiedName: string;
  // App Store modules and System: never touched.
  readonly excludedModules: ReadonlySet<string>;
  // Other entity names containing oldName (e.g. OrderLine for Order); these are never rewritten.
  readonly protectedNames: readonly string[];
};

export type RenameContextInput = {
  entityId: string;
  domainModelId: string;
  moduleName: string;
  oldName: string;
  newName: string;
  excludedModules: ReadonlySet<string>;
  allEntityNames: readonly string[];
};

export function createRenameContext(input: RenameContextInput): RenameContext {
  const context: RenameContext = {
    entityId: input.entityId,
    domainModelId: input.domainModelId,
    moduleName: input.moduleName,
    oldName: input.oldName,
    newName: input.newName,
    oldQualifiedName: `${input.moduleName}.${input.oldName}`,
    excludedModules: input.excludedModules,
    protectedNames: getProtectedNames(input.allEntityNames, input.oldName),
  };
  console.info(
    `rename context: ${context.oldQualifiedName} -> ${context.newName}, protected [${context.protectedNames.join(", ")}]`,
  );
  return context;
}

// A unit is in scope when it belongs to one of the app's own modules.
export function isInScope(info: Readonly<Primitives.UnitInfo>, context: RenameContext): boolean {
  return info.moduleName !== undefined && !context.excludedModules.has(info.moduleName);
}
