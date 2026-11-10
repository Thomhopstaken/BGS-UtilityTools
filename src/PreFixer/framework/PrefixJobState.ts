import { DocumentNameRegistry } from "../../shared/rename/DocumentNameRegistry";
import type { AppDocument } from "../prefixModel";

// What the prepare and scan steps find, for the plan step; empty until they run inside the dialog.
export class PrefixJobState {
  // Every document name at the start, all modules.
  readonly names = new DocumentNameRegistry();
  // Documents of the chosen group with the old prefix, in the app's own modules.
  candidates: readonly AppDocument[] = [];
  // Marketplace modules (System excluded); scanned, never changed.
  marketplaceModules: ReadonlySet<string> = new Set();
  // Entities, associations and module roles of the app's own modules: qualified name -> description.
  reservedNames: ReadonlyMap<string, string> = new Map();
  // Unit ids per unit type, as the model APIs list them.
  listed: ReadonlyMap<string, ReadonlySet<string>> = new Map();
  // Candidates a Marketplace document references: qualified name -> that document.
  readonly marketplaceReferences = new Map<string, string>();
}
