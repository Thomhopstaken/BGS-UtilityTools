import type { Primitives } from "@mendix/extensions-api";
import { getProtectedNames } from "./NamingPolicy";

// Everything a rename job needs to know about the entity, as plain data.
export type RenameContext = {
  readonly entityId: string;
  readonly domainModelId: string;
  readonly moduleName: string;
  readonly oldName: string;
  readonly newName: string;
  // Qualified name before the rename; the entity keeps it until the job's final step.
  readonly oldQualifiedName: string;
  // Qualified name after the rename; updaters write it into every reference.
  readonly newQualifiedName: string;
  // App Store modules and System: never touched.
  readonly excludedModules: ReadonlySet<string>;
  // Other entity names containing oldName (e.g. OrderLine for Order); these are never rewritten.
  readonly protectedNames: readonly string[];
  // Opt-in from the pane: also rename exposed names in published services (changes the published API).
  readonly renameExposedNames: boolean;
};

// Input for createRenameContext, which derives the qualified and protected names from it.
export type RenameContextInput = {
  entityId: string;
  domainModelId: string;
  moduleName: string;
  oldName: string;
  newName: string;
  excludedModules: ReadonlySet<string>;
  allEntityNames: readonly string[];
  // Off when absent.
  renameExposedNames?: boolean;
};

export function createRenameContext(input: RenameContextInput): RenameContext {
  const context: RenameContext = {
    entityId: input.entityId,
    domainModelId: input.domainModelId,
    moduleName: input.moduleName,
    oldName: input.oldName,
    newName: input.newName,
    oldQualifiedName: `${input.moduleName}.${input.oldName}`,
    newQualifiedName: `${input.moduleName}.${input.newName}`,
    excludedModules: input.excludedModules,
    protectedNames: getProtectedNames(input.allEntityNames, input.oldName),
    renameExposedNames: input.renameExposedNames ?? false,
  };
  console.info(
    `rename context: ${context.oldQualifiedName} -> ${context.newQualifiedName}, protected [${context.protectedNames.join(", ")}], exposed names ${context.renameExposedNames ? "renamed" : "kept"}`,
  );
  return context;
}

// A unit is in scope when it belongs to one of the app's own modules.
export function isInScope(info: Readonly<Primitives.UnitInfo>, context: RenameContext): boolean {
  return info.moduleName !== undefined && !context.excludedModules.has(info.moduleName);
}

// Old or new qualified name: units rewritten earlier in this job, or by an earlier partial run, hold the new one.
export function isEntityQname(qname: string | null | undefined, context: RenameContext): boolean {
  return qname === context.oldQualifiedName || qname === context.newQualifiedName;
}
