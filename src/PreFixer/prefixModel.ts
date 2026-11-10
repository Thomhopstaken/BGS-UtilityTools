import type { Primitives } from "@mendix/extensions-api";
import { isInScope } from "../shared/rename/JobScope";
import { getAppstoreModuleNames } from "../shared/rename/modules";
import type { RenamedDocumentNames } from "../shared/rename/RenamedDocumentNames";
import { groupLabel, renamableType } from "./documentTypes";
import { prefixOf } from "./prefixRename";

// The part of projects.getModulesTree() the PreFixer reads.
export type TreeDocument = { readonly $ID: string; readonly $Type: string; readonly name?: string };
export type TreeFolder = { readonly folders?: readonly TreeFolder[]; readonly documents?: readonly TreeDocument[] };
export type TreeModule = TreeFolder & { readonly name: string; readonly fromAppStore: boolean };

// A named document with its module, from the tree; usable as unit info.
export type AppDocument = Readonly<Primitives.UnitInfo> & { readonly name: string; readonly moduleName: string };

// One dropdown entry: a prefix within one type group.
export type PrefixOption = {
  // group:prefix, the dropdown value.
  readonly key: string;
  readonly group: string;
  readonly groupLabel: string;
  readonly prefix: string;
  readonly count: number;
  // First name with the prefix (alphabetical), for the preview line.
  readonly example: string;
};

// Everything the pane shows: the excluded modules (for the run) and the prefixes of the app's own modules.
export type PreFixerData = {
  readonly excludedModules: ReadonlySet<string>;
  readonly prefixes: readonly PrefixOption[];
};

export function prefixKey(group: string, prefix: string): string {
  return `${group}:${prefix}`;
}

// Every named document of the modules, folders flattened, with its module name.
// UNVERIFIED: tree documents carry the same $ID and $Type as the model APIs' getUnitsInfo().
export function listDocuments(modules: readonly TreeModule[]): AppDocument[] {
  const documents: AppDocument[] = [];
  const collect = (moduleName: string, node: TreeFolder): void => {
    for (const document of node.documents ?? []) {
      if (document.name !== undefined) {
        documents.push({ $ID: document.$ID, $Type: document.$Type, name: document.name, moduleName });
      }
    }
    (node.folders ?? []).forEach((folder) => collect(moduleName, folder));
  };
  modules.forEach((module) => collect(module.name, module));
  console.debug(`modules tree: ${modules.length} modules, ${documents.length} documents`);
  return documents;
}

// Prefixes per type group in the given documents; only renamable types count. Sorted by group label, then prefix.
export function collectPrefixes(documents: readonly AppDocument[]): PrefixOption[] {
  const byKey = new Map<string, { group: string; prefix: string; names: string[] }>();
  const notRenamable = new Set<string>();
  for (const document of documents) {
    const prefix = prefixOf(document.name);
    if (prefix === null) {
      continue;
    }
    const type = renamableType(document.$Type);
    if (type === undefined) {
      notRenamable.add(document.$Type);
      continue;
    }
    const key = prefixKey(type.group, prefix);
    const entry = byKey.get(key) ?? { group: type.group, prefix, names: [] };
    entry.names.push(document.name);
    byKey.set(key, entry);
  }
  if (notRenamable.size > 0) {
    console.debug(`prefixes: not renamable types left out: ${[...notRenamable].join(", ")}`);
  }
  const options = [...byKey.entries()].map(([key, entry]) => ({
    key,
    group: entry.group,
    groupLabel: groupLabel(entry.group),
    prefix: entry.prefix,
    count: entry.names.length,
    example: [...entry.names].sort()[0],
  }));
  options.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel) || a.prefix.localeCompare(b.prefix));
  console.info(`prefixes: ${options.map((o) => `${o.key} ${o.count}`).join(", ") || "none"}`);
  return options;
}

// One getModulesTree() call, with this session's renames put over it: the excluded modules, and the prefixes of the
// app's own modules.
export async function loadPreFixerData(
  projects: { getModulesTree(): Promise<readonly TreeModule[]> },
  renamedNames: RenamedDocumentNames,
): Promise<PreFixerData> {
  const started = Date.now();
  const tree = renamedNames.correct(await projects.getModulesTree());
  const excludedModules = getAppstoreModuleNames(tree);
  const scope = { excludedModules };
  const prefixes = collectPrefixes(listDocuments(tree).filter((document) => isInScope(document, scope)));
  console.info(`prefixer data loaded in ${Date.now() - started} ms`);
  return { excludedModules, prefixes };
}
