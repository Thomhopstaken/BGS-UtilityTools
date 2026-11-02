import type { DocumentRenameOutcome } from "./JobReport";

// The part of a projects.getModulesTree() node this needs.
type TreeNode = {
  readonly folders?: readonly TreeNode[];
  readonly documents?: readonly { readonly $ID: string; readonly name?: string }[];
};

// Seen in Studio Pro 11.12 (lead, 2026-11-02): projects.getModulesTree() keeps returning the old name of a document
// renamed through the API. The renames of this session are put over every tree read, by document $ID.
// UNVERIFIED: when the tree catches up (a Studio Pro restart?); a caught-up tree is left as it is.
export class RenamedDocumentNames {
  // $ID -> the name the tree showed before the first rename, and the name now.
  private readonly names = new Map<string, { readonly treeName: string; readonly name: string }>();

  get size(): number {
    return this.names.size;
  }

  // The saved renames of one run; a document renamed again keeps the name the tree showed first.
  record(renamed: readonly DocumentRenameOutcome[]): void {
    for (const outcome of renamed) {
      const earlier = this.names.get(outcome.unitId);
      this.names.set(outcome.unitId, {
        treeName: earlier?.treeName ?? bareName(outcome.oldQualifiedName),
        name: bareName(outcome.newQualifiedName),
      });
    }
    console.info(`renamed document names: ${renamed.length} recorded, ${this.names.size} in this session`);
  }

  // The tree with renamed documents under their new name, where it still shows the name from before the rename.
  // A different name (renamed again by hand) is the tree's newer knowledge and is kept.
  correct<T extends TreeNode>(modules: readonly T[]): T[] {
    if (this.names.size === 0) {
      return [...modules];
    }
    let corrected = 0;
    const fix = <N extends TreeNode>(node: N): N => {
      const documents = node.documents?.map((document) => {
        const entry = this.names.get(document.$ID);
        if (entry === undefined || document.name !== entry.treeName) {
          return document;
        }
        corrected++;
        return { ...document, name: entry.name };
      });
      return { ...node, documents, folders: node.folders?.map(fix) };
    };
    const result = modules.map(fix);
    console.info(`modules tree: ${corrected} stale document names replaced by their new name`);
    return result;
  }
}

// "Module.Name" -> "Name"; module names hold no dot.
function bareName(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.indexOf(".") + 1);
}
