import type { DocumentRenameOutcome } from "./JobReport";

// Loads the documents of one unit type by $ID: their current $ID and name. A document not returned no longer exists.
export type CurrentNameLoader = (unitType: string, ids: ReadonlySet<string>) => Promise<readonly { readonly $ID: string; readonly name?: string }[]>;

// The part of a projects.getModulesTree() node this needs.
type TreeNode = {
  readonly folders?: readonly TreeNode[];
  readonly documents?: readonly { readonly $ID: string; readonly name?: string }[];
};

// Seen in Studio Pro 11.12 (lead, 2026-11-02): projects.getModulesTree() keeps returning the old name of a document
// renamed through the API. The renames of this session are put over every tree read, by document $ID.
// A revert in Studio Pro is not seen by the tree either, so verify() checks the renames against the loaded documents.
// UNVERIFIED: when the tree catches up (a Studio Pro restart?); a caught-up tree is left as it is.
export class RenamedDocumentNames {
  // $ID -> its unit type, the name the tree showed before the first rename, and the name now.
  private readonly names = new Map<string, { readonly unitType: string; readonly treeName: string; readonly name: string }>();

  get size(): number {
    return this.names.size;
  }

  // The saved renames of one run; a document renamed again keeps the name the tree showed first.
  record(renamed: readonly DocumentRenameOutcome[]): void {
    for (const outcome of renamed) {
      const earlier = this.names.get(outcome.unitId);
      this.names.set(outcome.unitId, {
        unitType: outcome.unitType,
        treeName: earlier?.treeName ?? bareName(outcome.oldQualifiedName),
        name: bareName(outcome.newQualifiedName),
      });
    }
    console.info(`renamed document names: ${renamed.length} recorded, ${this.names.size} in this session`);
  }

  // Loads this session's renamed documents and keeps only what is true now: a reverted rename (the document has its
  // old name again) or a deleted document drops out, a later rename is taken over. A unit type that fails to load
  // keeps its entries; the failures are thrown together once every type was tried.
  // UNVERIFIED: a loaded unit shows the reverted name after a revert in Studio Pro.
  async verify(load: CurrentNameLoader): Promise<void> {
    if (this.names.size === 0) {
      console.debug("renamed document names: nothing to verify");
      return;
    }
    const started = Date.now();
    const idsByType = new Map<string, Set<string>>();
    for (const [id, entry] of this.names) {
      idsByType.set(entry.unitType, (idsByType.get(entry.unitType) ?? new Set()).add(id));
    }
    const failures: string[] = [];
    let reverted = 0;
    let deleted = 0;
    let changed = 0;
    for (const [unitType, ids] of idsByType) {
      let loaded: readonly { readonly $ID: string; readonly name?: string }[];
      try {
        loaded = await load(unitType, ids);
      } catch (error: unknown) {
        console.info(`renamed document names: ${unitType} could not be loaded, ${ids.size} kept as they are: ${error}`);
        failures.push(`${unitType}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const current = new Map(loaded.map((unit) => [unit.$ID, unit.name]));
      for (const id of ids) {
        const entry = this.names.get(id)!;
        const name = current.get(id);
        if (name === undefined) {
          console.debug(`renamed document names: ${id} '${entry.name}' not found, dropped`);
          this.names.delete(id);
          deleted++;
        } else if (name === entry.treeName) {
          console.debug(`renamed document names: ${id} '${entry.name}' is '${name}' again, rename reverted, dropped`);
          this.names.delete(id);
          reverted++;
        } else if (name !== entry.name) {
          console.debug(`renamed document names: ${id} '${entry.name}' is now '${name}'`);
          this.names.set(id, { ...entry, name });
          changed++;
        }
      }
    }
    console.info(
      `renamed document names: verified in ${Date.now() - started} ms, ${reverted} reverted, ${deleted} deleted, ${changed} renamed since, ${this.names.size} kept`,
    );
    if (failures.length > 0) {
      throw new Error(`could not load ${failures.join("; ")}`);
    }
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
