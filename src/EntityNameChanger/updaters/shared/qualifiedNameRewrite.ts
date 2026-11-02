import { type ModelElement, walkElements } from "./elementWalker";

// Old qualified name -> new. Case-sensitive.
export type QualifiedNameMap = ReadonlyMap<string, string>;

// Single-quoted literals ('' is an escaped quote) are matched first so they are left as they are.
// A dotted name (Module.Name, Module.Name.Member) not preceded by an identifier char, `.` or `$`.
const DOTTED_NAMES = /'(?:[^']|'')*'|(?<![A-Za-z0-9_.$])([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)/g;

// Longest renamed prefix on a segment boundary: Module.Doc.Param before Module.Doc.
function rewriteDottedName(name: string, renames: QualifiedNameMap): string {
  const segments = name.split(".");
  for (let length = segments.length; length >= 2; length--) {
    const prefix = segments.slice(0, length).join(".");
    const renamed = renames.get(prefix);
    if (renamed !== undefined) {
      return [renamed, ...segments.slice(length)].join(".");
    }
  }
  return name;
}

// Rewrites every renamed qualified name in an expression, XPath or reference property.
// `Module.OrderLine` and `Module.Order_Customer` are never touched when only `Module.Order` is renamed.
export function rewriteQualifiedNames(value: string, renames: QualifiedNameMap): string {
  if (renames.size === 0 || !value.includes(".")) {
    return value;
  }
  const newValue = value.replace(DOTTED_NAMES, (match: string, name?: string) =>
    name === undefined ? match : rewriteDottedName(name, renames),
  );
  if (newValue !== value) {
    console.debug(`updated reference '${value}' to '${newValue}'`);
  }
  return newValue;
}

// True when value holds qname or a member of it (qname.Member), outside quoted literals.
export function referencesQualifiedName(value: string, qname: string): boolean {
  for (const match of value.matchAll(DOTTED_NAMES)) {
    const name = match[1];
    if (name !== undefined && (name === qname || name.startsWith(`${qname}.`))) {
      return true;
    }
  }
  return false;
}

// Rewrites every string property (and string array item) of every element in the unit.
// onlyProperties: rewrite only these keys (nested elements are still walked), for documents whose other text mirrors
// an external API. Returns the number of changed values.
export function rewriteQualifiedNamesInUnit(root: object, renames: QualifiedNameMap, onlyProperties?: ReadonlySet<string>): number {
  let changes = 0;
  const rewrite = (value: string): string => {
    const newValue = rewriteQualifiedNames(value, renames);
    if (newValue !== value) {
      changes++;
    }
    return newValue;
  };
  walkElements(root, (element: ModelElement) => {
    for (const key of Object.keys(element)) {
      if (key.startsWith("$") || (onlyProperties !== undefined && !onlyProperties.has(key))) {
        continue;
      }
      const value = element[key];
      if (typeof value === "string") {
        const newValue = rewrite(value);
        if (newValue !== value) {
          element[key] = newValue;
        }
      } else if (Array.isArray(value)) {
        rewriteStringItems(value, rewrite);
      }
    }
  });
  const name = (root as { name?: unknown }).name;
  const message = `${typeof name === "string" ? name : "unit"}: ${changes} references updated`;
  if (changes > 0) {
    console.info(message);
  } else {
    console.debug(message);
  }
  return changes;
}

function rewriteStringItems(items: unknown[], rewrite: (value: string) => string): void {
  items.forEach((item, index) => {
    if (typeof item === "string") {
      const newItem = rewrite(item);
      if (newItem !== item) {
        items[index] = newItem;
      }
    }
  });
}
