import type { RowTarget } from "../shared/design/runLog";

// The two ways main.ts calls ui.editors.editDocument.
export type DocumentEditors = {
  openDocument(documentId: string): Promise<void>;
  // Opens the document and focuses the element.
  focusElement(documentId: string, elementId: string): Promise<void>;
};

// Opens a result row: the document, and the element when the row is one.
// UNVERIFIED: editDocument focuses a page widget by its $ID; when that fails, only the document opens.
export async function openTarget(editors: DocumentEditors, target: RowTarget): Promise<void> {
  if (target.elementId === undefined) {
    await editors.openDocument(target.documentId);
    return;
  }
  try {
    await editors.focusElement(target.documentId, target.elementId);
  } catch (error: unknown) {
    console.info(`class searcher: focusing ${target.elementId} failed, opening the document only: ${error}`);
    await editors.openDocument(target.documentId);
  }
}
