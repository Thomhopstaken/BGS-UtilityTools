import type { RenameContext } from "./RenameContext";

// Every qualified name renamed during a job, old -> new: the entity, documents and document parameters.
// Filled by the rename updaters, read by the reference updaters that run after them.
export class QualifiedNameRenames {
  private readonly renames = new Map<string, string>();

  // Seeded with the entity rename.
  static forEntity(context: RenameContext): QualifiedNameRenames {
    const renames = new QualifiedNameRenames();
    renames.add(context.oldQualifiedName, context.newQualifiedName);
    return renames;
  }

  get map(): ReadonlyMap<string, string> {
    return this.renames;
  }

  get size(): number {
    return this.renames.size;
  }

  add(oldQname: string, newQname: string): void {
    if (oldQname === newQname) {
      return;
    }
    this.renames.set(oldQname, newQname);
    console.debug(`qualified name rename: ${oldQname} -> ${newQname}`);
  }

  addDocument(moduleName: string, oldName: string, newName: string): void {
    this.add(`${moduleName}.${oldName}`, `${moduleName}.${newName}`);
  }

  // Callers reference a parameter as Module.Document.Parameter, with the document's old name.
  addParameter(moduleName: string, oldDocument: string, newDocument: string, oldName: string, newName: string): void {
    this.add(`${moduleName}.${oldDocument}.${oldName}`, `${moduleName}.${newDocument}.${newName}`);
  }

  // The current name of a document that may have been renamed earlier in the job.
  current(qname: string): string {
    return this.renames.get(qname) ?? qname;
  }
}
