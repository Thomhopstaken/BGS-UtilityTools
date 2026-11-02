// Minimal shape of projects.getModulesTree(): modules and folders with nested documents.
export type DocumentTreeNode = {
  readonly name?: string;
  readonly folders?: readonly DocumentTreeNode[];
  readonly documents?: readonly { readonly name?: string }[];
};

// Document names per module; names are unique within a module across all document types.
// Associations are not documents and are not in here.
export class DocumentNameRegistry {
  private readonly names = new Map<string, Set<string>>();
  // Names that existed before any rename was planned; never changed by register().
  private readonly initialNames = new Map<string, Set<string>>();

  static fromModulesTree(modules: readonly DocumentTreeNode[]): DocumentNameRegistry {
    const registry = new DocumentNameRegistry();
    registry.load(modules);
    return registry;
  }

  // Adds every document of projects.getModulesTree(); filled when the job starts, after the registry was handed out.
  load(modules: readonly DocumentTreeNode[]): void {
    for (const module of modules) {
      if (module.name === undefined) {
        continue;
      }
      this.collect(module.name, module);
    }
    console.info(`document name registry: ${this.names.size} modules, ${this.size} documents`);
  }

  get size(): number {
    let size = 0;
    this.names.forEach((names) => (size += names.size));
    return size;
  }

  // An existing document.
  add(moduleName: string, name: string): void {
    addName(this.names, moduleName, name);
    addName(this.initialNames, moduleName, name);
  }

  // Includes the renames registered so far; existedAtStart() ignores them.
  isFree(moduleName: string, name: string): boolean {
    return !(this.names.get(moduleName)?.has(name) ?? false);
  }

  existedAtStart(moduleName: string, name: string): boolean {
    return this.initialNames.get(moduleName)?.has(name) ?? false;
  }

  // Also reverts a planned rename when called with the names swapped.
  register(moduleName: string, oldName: string, newName: string): void {
    this.names.get(moduleName)?.delete(oldName);
    addName(this.names, moduleName, newName);
    console.debug(`document name registry: ${moduleName}.${oldName} -> ${moduleName}.${newName}`);
  }

  private collect(moduleName: string, node: DocumentTreeNode): void {
    for (const document of node.documents ?? []) {
      if (document.name !== undefined) {
        this.add(moduleName, document.name);
      }
    }
    for (const folder of node.folders ?? []) {
      this.collect(moduleName, folder);
    }
  }
}

function addName(names: Map<string, Set<string>>, moduleName: string, name: string): void {
  let moduleNames = names.get(moduleName);
  if (moduleNames === undefined) {
    moduleNames = new Set<string>();
    names.set(moduleName, moduleNames);
  }
  moduleNames.add(name);
}
