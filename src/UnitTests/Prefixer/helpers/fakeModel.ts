import type { Primitives } from "@mendix/extensions-api";
import type { AppDocument, TreeDocument, TreeFolder, TreeModule } from "../../../Prefixer/prefixModel";
import type { AppModel } from "../../../shared/rename/referenceTypes";
import { type FakeUnitAccess, fakeUnitAccess } from "../../shared/helpers/fakes";

// Test-only builders for the modules tree and the app.model of a Prefixer run.

export const MF = "Microflows$Microflow";
export const NF = "Microflows$Nanoflow";
export const PAGE = "Pages$Page";
export const CONSTANT = "Constants$Constant";

export function treeDocument(id: string, type: string, name: string): TreeDocument {
  return { $ID: id, $Type: type, name };
}

export function treeModule(name: string, documents: TreeDocument[] = [], folders: TreeFolder[] = [], fromAppStore = false): TreeModule {
  return { name, fromAppStore, documents, folders };
}

export function appDocument(id: string, type: string, name: string, moduleName = "M"): AppDocument {
  return { $ID: id, $Type: type, name, moduleName };
}

// The tree documents as unit infos, as a model API lists them.
export function infosOf(modules: readonly TreeModule[], type: string): Readonly<Primitives.UnitInfo>[] {
  const infos: Primitives.UnitInfo[] = [];
  const collect = (moduleName: string, node: TreeFolder) => {
    for (const d of node.documents ?? []) {
      if (d.$Type === type) {
        infos.push({ $ID: d.$ID, $Type: d.$Type, moduleName, name: d.name } as Primitives.UnitInfo);
      }
    }
    (node.folders ?? []).forEach((f) => collect(moduleName, f));
  };
  modules.forEach((m) => collect(m.name, m));
  return infos;
}

export type FakeAppModel = {
  model: AppModel;
  // The access of an app.model API, created empty on first use.
  api(name: keyof AppModel): FakeUnitAccess<Primitives.UnitBase>;
  treeCalls: number;
};

// app.model with projects.getModulesTree() and an empty unit access for every API not given.
export function fakeAppModel(tree: readonly TreeModule[], apis: Partial<Record<keyof AppModel, FakeUnitAccess<Primitives.UnitBase>>> = {}): FakeAppModel {
  const accesses = new Map<PropertyKey, FakeUnitAccess<Primitives.UnitBase>>(Object.entries(apis));
  const fake: FakeAppModel = {
    treeCalls: 0,
    api: (name) => {
      if (!accesses.has(name)) {
        accesses.set(name, fakeUnitAccess<Primitives.UnitBase>([]));
      }
      return accesses.get(name)!;
    },
    model: undefined as unknown as AppModel,
  };
  const projects = {
    getModulesTree: async () => {
      fake.treeCalls++;
      return tree;
    },
  };
  fake.model = new Proxy({} as AppModel, {
    get: (_, prop) => (prop === "projects" ? projects : fake.api(prop as keyof AppModel)),
  });
  return fake;
}
