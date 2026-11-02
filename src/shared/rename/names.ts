// Names Mendix does not allow for an entity, compared case-insensitively.
// UNVERIFIED: Studio Pro rejects the same words as document names.
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
