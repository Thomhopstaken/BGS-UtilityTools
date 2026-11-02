// Names Mendix does not allow for an entity, compared case-insensitively.
export const RESERVED_NAMES: ReadonlySet<string> = new Set(
  [
    "_", "abstract", "assert", "boolean", "break", "byte", "case", "catch", "changedby", "changeddate", "char",
    "class", "com", "con", "const", "context", "continue", "createddate", "currentUser", "default", "do", "double",
    "else", "empty", "enum", "extends", "false", "final", "finally", "float", "for", "goto", "guid", "id", "if",
    "implements", "import", "instanceof", "int", "interface", "long", "MendixObject", "native", "new", "null",
    "object", "owner", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
    "submetaobjectname", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "true", "try",
    "type", "void", "volatile", "while",
  ].map((name) => name.toLowerCase()),
);

export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name.toLowerCase());
}

// Early check against the pane's entity list, so the common mistake is reported before the dialog opens.
// The list may be stale; EntityRenameStep checks again against a fresh domain model.
export function findTakenEntityName(entityNames: readonly string[], moduleName: string, newName: string): string | null {
  if (!entityNames.includes(newName)) {
    return null;
  }
  console.debug(`new name '${newName}' is taken in ${moduleName}`);
  return `An entity named ${moduleName}.${newName} already exists.`;
}

// Checks the pane input before a rename; returns an error message, or null when the name can be used.
// A name taken in the same module is checked by findTakenEntityName and later by EntityRenameStep.validate.
export function validateNewName(entity: { readonly name: string } | undefined, newName: string | null): string | null {
  if (entity === undefined) {
    return "Select an entity to rename.";
  }
  if (newName === null || newName.length === 0) {
    return "Enter a new name.";
  }
  if (newName === entity.name) {
    return "The new name is the same as the current name.";
  }
  if (isReservedName(newName)) {
    console.debug(`new name '${newName}' is reserved`);
    return `'${newName}' is a reserved word and cannot be used as an entity name.`;
  }
  if (!/^[A-Za-z]\w*$/.test(newName)) {
    return "Use letters, digits and underscores, starting with a letter.";
  }
  console.debug(`new name '${newName}' for ${entity.name} is valid`);
  return null;
}

// Pane inputs a FieldProblem can point to.
export type PaneField ="module" | "entity" | "name";

export type FieldProblem = {
  readonly field: PaneField;
  readonly message: string;
};

export type PaneRequestInput = {
  readonly moduleName: string;
  readonly entity: { readonly name: string } | undefined;
  readonly newName: string;
};

// Checks the whole form; the problem names the field to mark, or null when the rename can start.
export function validateRequest(input: PaneRequestInput): FieldProblem | null {
  if (input.moduleName.length === 0) {
    console.debug("request: no module selected");
    return { field: "module", message: "Select a module." };
  }
  if (input.entity === undefined) {
    console.debug(`request: no entity selected in ${input.moduleName}`);
    return { field: "entity", message: "Select an entity to rename." };
  }
  const problem = validateNewName(input.entity, input.newName);
  return problem === null ? null : { field: "name", message: problem };
}
