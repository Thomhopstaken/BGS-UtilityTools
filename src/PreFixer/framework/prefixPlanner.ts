import type { DocumentNameRegistry } from "../../shared/rename/DocumentNameRegistry";
import type { AppDocument } from "../prefixModel";
import { documentNameProblem, type PrefixChange, renameWithPrefix } from "../prefixRename";

export type PrefixPlanInput = {
  // Documents of the chosen group with the old prefix, in the app's own modules.
  readonly candidates: readonly AppDocument[];
  readonly change: PrefixChange;
  // Every document name at the start; renames are registered as they are planned.
  readonly names: DocumentNameRegistry;
  // Entities, associations and module roles: qualified name -> description.
  readonly reservedNames: ReadonlyMap<string, string>;
  // Candidates a Marketplace document references: qualified name -> that document.
  readonly marketplaceReferences: ReadonlyMap<string, string>;
  // Unit ids each model API lists, per unit type.
  readonly listed: ReadonlyMap<string, ReadonlySet<string>>;
};

export type PrefixDecision =
  | { readonly kind: "rename"; readonly document: AppDocument; readonly newName: string }
  | { readonly kind: "skip"; readonly document: AppDocument; readonly newName: string | null; readonly reason: string };

// Decides per candidate whether it is renamed, read-only apart from registering planned names. The first reason that
// applies skips a document. A new name must not have existed at the start, so new names are never rename keys and
// renames never chain (ACT_ACT_X -> ACT_X is skipped when ACT_X exists).
export function planPrefixRenames(input: PrefixPlanInput): PrefixDecision[] {
  const decisions = input.candidates.map((document) => decide(document, input));
  const renamed = decisions.filter((d) => d.kind === "rename").length;
  console.info(`prefix plan: ${renamed} renames, ${decisions.length - renamed} skipped of ${input.candidates.length} candidates`);
  return decisions;
}

function decide(document: AppDocument, input: PrefixPlanInput): PrefixDecision {
  const newName = renameWithPrefix(document.name, input.change);
  const skip = (reason: string, name: string | null = newName): PrefixDecision => {
    console.debug(`prefix plan: ${document.moduleName}.${document.name} skipped: ${reason}`);
    return { kind: "skip", document, newName: name, reason };
  };
  if (newName === null) {
    return skip(`has no prefix ${input.change.oldPrefix}_`);
  }
  if (input.listed.get(document.$Type)?.has(document.$ID) !== true) {
    return skip("not listed by the model API, so it can't be loaded");
  }
  const nameProblem = documentNameProblem(newName);
  if (nameProblem !== null) {
    return skip(nameProblem);
  }
  const module = document.moduleName;
  const oldQname = `${module}.${document.name}`;
  const newQname = `${module}.${newName}`;
  const reservedOld = input.reservedNames.get(oldQname);
  if (reservedOld !== undefined) {
    return skip(`shares its name with ${reservedOld}, so references to it can't be told apart`);
  }
  const reservedNew = input.reservedNames.get(newQname);
  if (reservedNew !== undefined) {
    return skip(`the new name is used by ${reservedNew}`);
  }
  const marketplace = input.marketplaceReferences.get(oldQname);
  if (marketplace !== undefined) {
    return skip(`used by ${marketplace} in a Marketplace module, which is never changed`);
  }
  if (input.names.existedAtStart(module, newName) || !input.names.isFree(module, newName) || input.names.takenIgnoringCase(module, newName, document.name)) {
    return skip(`${newQname} already exists`);
  }
  input.names.register(module, document.name, newName);
  return { kind: "rename", document, newName };
}
