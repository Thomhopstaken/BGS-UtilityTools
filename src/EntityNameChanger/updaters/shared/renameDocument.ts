import type { Primitives } from "@mendix/extensions-api";
import type { DocumentNameRegistry } from "../../framework/DocumentNameRegistry";
import type { NamingPolicy } from "../../framework/NamingPolicy";

export type DocumentRename = { renamedTo: string | null; skipped: number };

export const NOT_RENAMED: Readonly<DocumentRename> = Object.freeze({ renamedTo: null, skipped: 0 });

// Decides a document rename (kind: "microflow", "page", ...) when allowed and the new name is free in its module.
// Reserves the new name in the registry; the document itself is not changed (planning is read-only).
export function planDocumentRename(
  kind: string,
  name: string,
  info: Readonly<Primitives.UnitInfo>,
  naming: NamingPolicy,
  documentNames: DocumentNameRegistry,
  shouldRename: boolean,
): DocumentRename {
  if (!shouldRename) {
    return { ...NOT_RENAMED };
  }
  const newName = naming.rename(name);
  const moduleName = info.moduleName;
  if (newName === name || moduleName === undefined) {
    return { ...NOT_RENAMED };
  }
  if (!documentNames.isFree(moduleName, newName)) {
    console.info(`skipped renaming ${kind} ${moduleName}.${name}: ${newName} already exists`);
    return { renamedTo: null, skipped: 1 };
  }
  console.info(`planned rename of ${kind} ${moduleName}.${name} to ${newName}`);
  documentNames.register(moduleName, name, newName);
  return { renamedTo: newName, skipped: 0 };
}
