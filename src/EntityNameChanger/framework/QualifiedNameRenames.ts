import { type QualifiedNameMap, qualifiedNamePrefix } from "../updaters/shared/qualifiedNameRewrite";
import type { RenameContext } from "./RenameContext";

// Every qualified name renamed during a job, old -> new: the entity, documents and document parameters.
// Filled by the planners, read by the reference updaters that run after them.
export class QualifiedNameRenames {
  private readonly renames = new Map<string, string>();
  // Module.Name prefixes of the keys; null after a change.
  private keyPrefixes: ReadonlySet<string> | null = null;
  // Old qualified name -> ids of the units declaring it (a document and an association can share a name). A new name
  // exists in Studio Pro once every declaring unit was saved.
  private readonly owners = new Map<string, Set<string>>();

  // Seeded with the entity rename, declared by its domain model.
  static forEntity(context: RenameContext): QualifiedNameRenames {
    const renames = new QualifiedNameRenames();
    renames.add(context.oldQualifiedName, context.newQualifiedName, context.domainModelId);
    return renames;
  }

  get map(): ReadonlyMap<string, string> {
    return this.renames;
  }

  get size(): number {
    return this.renames.size;
  }

  // Module.Name prefixes of every renamed qualified name; a dotted name without one of these needs no rewrite.
  prefixes(): ReadonlySet<string> {
    if (this.keyPrefixes === null) {
      this.keyPrefixes = new Set([...this.renames.keys()].map(qualifiedNamePrefix));
      console.debug(`qualified name renames: ${this.keyPrefixes.size} prefixes`);
    }
    return this.keyPrefixes;
  }

  // Module.Name prefixes of names with members renamed (Module.Document.Parameter): documents whose parameters changed.
  parameterOwnerPrefixes(): ReadonlySet<string> {
    const prefixes = new Set<string>();
    for (const key of this.renames.keys()) {
      const prefix = qualifiedNamePrefix(key);
      if (prefix !== key) {
        prefixes.add(prefix);
      }
    }
    return prefixes;
  }

  // owner: id of the unit declaring the name; without one the name never counts as existing (see existing()).
  add(oldQname: string, newQname: string, owner?: string): void {
    if (oldQname === newQname) {
      return;
    }
    this.renames.set(oldQname, newQname);
    this.keyPrefixes = null;
    if (owner !== undefined) {
      const owners = this.owners.get(oldQname) ?? new Set<string>();
      owners.add(owner);
      this.owners.set(oldQname, owners);
    }
    console.debug(`qualified name rename: ${oldQname} -> ${newQname}${owner === undefined ? "" : ` (declared by ${owner})`}`);
  }

  addDocument(moduleName: string, oldName: string, newName: string, owner?: string): void {
    this.add(`${moduleName}.${oldName}`, `${moduleName}.${newName}`, owner);
  }

  // Callers reference a parameter as Module.Document.Parameter, with the document's old name.
  addParameter(moduleName: string, oldDocument: string, newDocument: string, oldName: string, newName: string, owner?: string): void {
    this.add(`${moduleName}.${oldDocument}.${oldName}`, `${moduleName}.${newDocument}.${newName}`, owner);
  }

  addAssociation(moduleName: string, oldName: string, newName: string, owner?: string): void {
    this.add(`${moduleName}.${oldName}`, `${moduleName}.${newName}`, owner);
  }

  remove(oldQname: string): void {
    if (this.renames.delete(oldQname)) {
      this.owners.delete(oldQname);
      this.keyPrefixes = null;
      console.debug(`qualified name rename removed: ${oldQname}`);
    }
  }

  // The renames whose new name exists already: every declaring unit was saved. Names without a known declaring unit
  // are left out, so a unit rewritten with these never points to a name that doesn't exist yet.
  existing(isSaved: (unitId: string) => boolean): QualifiedNameMap {
    const existing = new Map<string, string>();
    for (const [oldQname, newQname] of this.renames) {
      const owners = this.owners.get(oldQname);
      if (owners !== undefined && [...owners].every(isSaved)) {
        existing.set(oldQname, newQname);
      }
    }
    console.debug(`qualified name renames: ${existing.size} of ${this.renames.size} exist already`);
    return existing;
  }

  // Points the parameter renames of document `document` (keys Module.document.*) from `fromDocument` to
  // `toDocument`, after a document rename was added or revoked late in planning.
  retargetDocument(moduleName: string, document: string, fromDocument: string, toDocument: string): void {
    const keyPrefix = `${moduleName}.${document}.`;
    const fromPrefix = `${moduleName}.${fromDocument}.`;
    for (const [oldQname, newQname] of [...this.renames]) {
      if (oldQname.startsWith(keyPrefix) && newQname.startsWith(fromPrefix)) {
        const retargeted = `${moduleName}.${toDocument}.${newQname.slice(fromPrefix.length)}`;
        console.debug(`qualified name rename retargeted: ${oldQname} -> ${retargeted}`);
        if (oldQname === retargeted) {
          this.renames.delete(oldQname);
          this.keyPrefixes = null;
        } else {
          this.renames.set(oldQname, retargeted);
        }
      }
    }
  }
}
