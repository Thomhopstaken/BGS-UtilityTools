import type { Primitives } from "@mendix/extensions-api";
import { loadInScope } from "../../shared/rename/loadInScope";
import { getAppstoreModuleNames, type ModuleOrigin } from "../../shared/rename/modules";
import type { UnitAccess } from "../../shared/rename/types";
import { UnitInfoCache } from "../../shared/rename/UnitInfoCache";
import { DOCUMENT_KINDS, type DocumentKind } from "../documentKinds";
import { type ClassMatch, findClassUsages } from "./findClassUsages";

// What a search reads; app.model fits it, tests fake it.
export type ClassSearchModel = {
  readonly modules: { getModules(): Promise<ReadonlyArray<Readonly<ModuleOrigin>>> };
  readonly documents: Readonly<Record<DocumentKind, UnitAccess<Primitives.UnitBase>>>;
};

export type ClassSearchResult = {
  readonly className: string;
  readonly matches: readonly ClassMatch[];
  readonly documentsSearched: number;
};

// Searches every document kind in the app's own modules; Marketplace modules and System are skipped.
// Read-only, and loads fresh on every search so edits since the last search are seen.
export async function searchClass(model: ClassSearchModel, className: string, batchSize?: number): Promise<ClassSearchResult> {
  const started = Date.now();
  console.info(`class searcher: searching '${className}'`);
  const scope = { excludedModules: getAppstoreModuleNames(await model.modules.getModules()) };
  const unitInfos = new UnitInfoCache();
  const matches: ClassMatch[] = [];
  let documentsSearched = 0;
  for (const { kind, unitType, plural } of DOCUMENT_KINDS) {
    const kindStarted = Date.now();
    const loaded = await loadInScope(model.documents[kind], unitType, unitInfos, scope, batchSize);
    let found = 0;
    for (const { info, unit } of loaded) {
      const usages = findClassUsages(unit, { id: info.$ID, qualifiedName: qualifiedName(info), kind }, className);
      found += usages.length;
      matches.push(...usages);
    }
    documentsSearched += loaded.length;
    console.info(`class searcher: ${loaded.length} ${plural} searched, ${found} matches, ${Date.now() - kindStarted} ms`);
  }
  console.info(`class searcher: '${className}' found ${matches.length} times in ${documentsSearched} documents, ${Date.now() - started} ms`);
  return { className, matches, documentsSearched };
}

function qualifiedName(info: Readonly<Primitives.UnitInfo>): string {
  return `${info.moduleName}.${info.name ?? info.$ID}`;
}
