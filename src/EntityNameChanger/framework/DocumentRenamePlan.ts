import { type DocumentRename, NOT_RENAMED } from "../updaters/shared/renameDocument";

// Document renames decided in the planning phase, by unit id; applied in the write phase.
export class DocumentRenamePlan {
  private readonly renames = new Map<string, DocumentRename>();

  set(unitId: string, rename: DocumentRename): void {
    this.renames.set(unitId, rename);
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
}
