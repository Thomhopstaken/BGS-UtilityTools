import { isReservedName } from "../shared/rename/names";

// A prefix (lead's rule): 1-4 capital letters before the first underscore, with something after it.
// ACT_Order_Save and ACT_Save have prefix ACT; Act_Order_Save, V2_Order_Save and ACT_ have none.
const PREFIXED_NAME = /^([A-Z]{1,4})_./;

// What one run changes: the prefix of one document type group, to a new prefix or removed (null).
export type PrefixChange = {
  readonly group: string;
  readonly oldPrefix: string;
  readonly newPrefix: string | null;
};

// The prefix of a document name, or null when it has none. Exact case.
export function prefixOf(name: string): string | null {
  return PREFIXED_NAME.exec(name)?.[1] ?? null;
}

// The new name, or null when the name doesn't have the old prefix.
export function renameWithPrefix(name: string, change: PrefixChange): string | null {
  if (prefixOf(name) !== change.oldPrefix) {
    return null;
  }
  const rest = name.slice(change.oldPrefix.length + 1);
  return change.newPrefix === null ? rest : `${change.newPrefix}_${rest}`;
}

// "ACT_ → SUB_" or "remove ACT_", for titles and the run log.
export function describeChange(change: PrefixChange): string {
  return change.newPrefix === null ? `remove ${change.oldPrefix}_` : `${change.oldPrefix}_ → ${change.newPrefix}_`;
}

// Why Studio Pro would reject a document name, or null. Removing a prefix can leave e.g. "1Order_Save".
// UNVERIFIED: document names follow the entity name rules (start with a letter; letters, digits, underscores).
export function documentNameProblem(name: string): string | null {
  if (name.length === 0) {
    return "the new name would be empty";
  }
  if (!/^[A-Za-z]\w*$/.test(name)) {
    return `'${name}' is not a valid name: it must start with a letter and hold only letters, digits and underscores`;
  }
  if (isReservedName(name)) {
    return `'${name}' is a reserved word`;
  }
  return null;
}
