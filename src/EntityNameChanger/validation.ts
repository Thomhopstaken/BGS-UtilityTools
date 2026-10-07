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

// Checks the pane input before a rename; returns an error message, or null when the name can be used.
// A name taken in the same module is checked later by EntityRenameStep.validate against a fresh domain model.
export function validateNewName(entity: { readonly name: string } | undefined, newName: string | null): string | null {
  if (entity === undefined) {
    return "Select an entity to rename.";
  }
  if (newName === null || newName.length === 0) {
    return "Fill in a new name.";
  }
  if (newName === entity.name) {
    return "The new name is the same as the current name.";
  }
  if (isReservedName(newName)) {
    console.debug(`new name '${newName}' is reserved`);
    return `'${newName}' is a reserved word and cannot be used as an entity name.`;
  }
  if (!/^[A-Za-z]\w*$/.test(newName)) {
    return "Name contains spaces or illegal characters";
  }
  console.debug(`new name '${newName}' for ${entity.name} is valid`);
  return null;
}
