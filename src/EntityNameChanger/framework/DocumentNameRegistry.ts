// Minimal shape of projects.getModulesTree(): modules and folders with nested documents.
export type DocumentTreeNode = {
  readonly name?: string;
  readonly folders?: readonly DocumentTreeNode[];
  readonly documents?: readonly { readonly name?: string }[];
};

// Document names per module; names are unique within a module across all document types.
export class DocumentNameRegistry {
  private readonly names = new Map<string, Set<string>>();

  static fromModulesTree(modules: readonly DocumentTreeNode[]): DocumentNameRegistry {
    const registry = new DocumentNameRegistry();
    for (const module of modules) {
      if (module.name === undefined) {
        continue;
      }
      registry.collect(module.name, module);
    }
    console.info(`document name registry: ${registry.names.size} modules, ${registry.size} documents`);
    return registry;
  }

  get size(): number {
    let size = 0;
    this.names.forEach((names) => (size += names.size));
    return size;
  }

  add(moduleName: string, name: string): void {
    let names = this.names.get(moduleName);
    if (names === undefined) {
      names = new Set<string>();
      this.names.set(moduleName, names);
    }
    names.add(name);
  }

  isFree(moduleName: string, name: string): boolean {
    return !(this.names.get(moduleName)?.has(name) ?? false);
  }

  register(moduleName: string, oldName: string, newName: string): void {
    this.names.get(moduleName)?.delete(oldName);
    this.add(moduleName, newName);
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
