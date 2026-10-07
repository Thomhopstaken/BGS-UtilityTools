// Old variable name -> new name. Names are case-sensitive.
export type RenameMap = ReadonlyMap<string, string>;

// Single-quoted literals ('' is an escaped quote) are matched first so they are left as they are.
const EXPRESSION_TOKENS = /'(?:[^']|'')*'|\$([A-Za-z_][A-Za-z0-9_]*)/g;

// For expressions and XPath: replaces every `$Name` token whose full name was renamed, in one pass.
// The whole identifier is matched, so `$OrderLine` is never touched when only `$Order` is renamed.
export function rewriteExpression(value: string, renames: RenameMap): string {
  if (renames.size === 0) {
    return value;
  }
  const newValue = value.replace(EXPRESSION_TOKENS, (match: string, name?: string) => {
    if (name === undefined) {
      return match;
    }
    const newName = renames.get(name);
    return newName === undefined ? match : `$${newName}`;
  });
  if (newValue !== value) {
    console.debug(`updated expression '${value}' to '${newValue}'`);
  }
  return newValue;
}

// For properties that hold a bare variable name (no `$`).
export function rewriteName(name: string, renames: RenameMap): string {
  const newName = renames.get(name);
  if (newName === undefined) {
    return name;
  }
  console.debug(`updated variable reference '${name}' to '${newName}'`);
  return newName;
}
