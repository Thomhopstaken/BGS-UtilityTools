import { type DocumentRename, NOT_RENAMED } from "../updaters/shared/renameDocument";

// "Module.Name", or undefined when the unit has no module.
export function qualifiedName(moduleName: string | undefined, name: string): string | undefined {
  return moduleName === undefined ? undefined : `${moduleName}.${name}`;
}

// Document renames decided in the planning phase, by unit id; applied in the write phase.
export class DocumentRenamePlan {
  private readonly renames = new Map<string, DocumentRename>();
  // Original qualified name -> unit id of every planned document, renamed or not.
  private readonly unitIds = new Map<string, string>();
  // Units with changes besides a document rename (variables, parameters, texts); the rename phase loads only these.
  private readonly work = new Set<string>();

  // qname: the document's original qualified name, for unitIdOf().
  set(unitId: string, rename: DocumentRename, qname?: string): void {
    this.renames.set(unitId, rename);
    if (qname !== undefined) {
      this.unitIds.set(qname, unitId);
    }
  }

  // Not planned (e.g. the unit was not seen in planning): not renamed.
  get(unitId: string): DocumentRename {
    const rename = this.renames.get(unitId);
    if (rename === undefined) {
      console.debug(`no document rename planned for ${unitId}`);
      return { ...NOT_RENAMED };
    }
    return rename;
  }

  markWork(unitId: string): void {
    this.work.add(unitId);
  }

  // Asked when the rename step starts, so document renames forced or revoked late in planning count. A skipped
  // document rename counts too: the rename phase reports it.
  needsRename(unitId: string): boolean {
    const rename = this.renames.get(unitId);
    return this.work.has(unitId) || (rename !== undefined && (rename.renamedTo !== null || rename.skipped > 0));
  }

  // Unit id of a planned document by its original qualified name; undefined for documents we don't plan.
  unitIdOf(qname: string): string | undefined {
    return this.unitIds.get(qname);
  }
}
