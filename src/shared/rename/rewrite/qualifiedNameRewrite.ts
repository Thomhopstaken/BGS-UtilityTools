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

// The first of qnames that value references (the name itself or a member of it), outside quoted literals; null if
// none. qnames must be qualified (at least Module.Name). One regex pass, whatever the number of qnames.
export function findReferencedName(value: string, qnames: { has(qname: string): boolean }): string | null {
  if (!value.includes(".")) {
    return null;
  }
  for (const match of value.matchAll(DOTTED_NAMES)) {
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    const segments = name.split(".");
    for (let length = 2; length <= segments.length; length++) {
      const prefix = segments.slice(0, length).join(".");
      if (qnames.has(prefix)) {
        return prefix;
      }
    }
  }
  return null;
}

// Module.Name part of a dotted name: every rename key has at least these two segments, and the rewrite only matches
// keys anchored at the start of a dotted name.
export function qualifiedNamePrefix(name: string): string {
  const first = name.indexOf(".");
  const second = first === -1 ? -1 : name.indexOf(".", first + 1);
  return second === -1 ? name : name.slice(0, second);
}

// Module.Name prefixes of every dotted name the rewrite could change in the unit, outside quoted literals.
// Uses the rewrite's own traversal (all properties), so a unit without a renamed prefix needs no rewrite.
export function qualifiedNamePrefixes(root: object): Set<string> {
  const prefixes = new Set<string>();
  visitStrings(root, (value) => {
    if (value.includes(".")) {
      for (const match of value.matchAll(DOTTED_NAMES)) {
        if (match[1] !== undefined) {
          prefixes.add(qualifiedNamePrefix(match[1]));
        }
      }
    }
    return value;
  });
  return prefixes;
}

// The first of qnames any string in the unit references (as the rewrite sees them); null if none. onlyProperties: the
// same allow-list as the rewrite, so a name outside it doesn't count.
export function findReferencedNameInUnit(
  root: object,
  qnames: { has(qname: string): boolean },
  onlyProperties?: ReadonlySet<string>,
): string | null {
  let found: string | null = null;
  visitStrings(
    root,
    (value) => {
      found ??= findReferencedName(value, qnames);
      return value;
    },
    onlyProperties,
  );
  return found;
}

// Rewrites every string property (and string array item) of every element in the unit.
// onlyProperties: rewrite only these keys (nested elements are still walked), for documents whose other text mirrors
// an external API; "Type$Element.key" allows a key on one element type only. Returns the number of changed values.
export function rewriteQualifiedNamesInUnit(root: object, renames: QualifiedNameMap, onlyProperties?: ReadonlySet<string>): number {
  let changes = 0;
  visitStrings(
    root,
    (value) => {
      const newValue = rewriteQualifiedNames(value, renames);
      if (newValue !== value) {
        changes++;
      }
      return newValue;
    },
    onlyProperties,
  );
  const name = (root as { name?: unknown }).name;
  const message = `${typeof name === "string" ? name : "unit"}: ${changes} references updated`;
  if (changes > 0) {
    console.info(message);
  } else {
    console.debug(message);
  }
  return changes;
}

// A key is allowed for every element type ("value"), or for one type ("Rest$ConstantValue.value").
function isAllowed(onlyProperties: ReadonlySet<string>, type: string, key: string): boolean {
  return onlyProperties.has(key) || onlyProperties.has(`${type}.${key}`);
}

// Every string property and string array item of every element ($-keys skipped); a different returned string
// replaces the value. Shared by the rewrite and the reference index, so both see the same strings.
function visitStrings(root: object, visit: (value: string) => string, onlyProperties?: ReadonlySet<string>): void {
  walkElements(root, (element: ModelElement) => {
    for (const key of Object.keys(element)) {
      if (key.startsWith("$") || (onlyProperties !== undefined && !isAllowed(onlyProperties, element.$Type, key))) {
        continue;
      }
      const value = element[key];
      if (typeof value === "string") {
        const newValue = visit(value);
        if (newValue !== value) {
          element[key] = newValue;
        }
      } else if (Array.isArray(value)) {
        value.forEach((item: unknown, index) => {
          if (typeof item === "string") {
            const newItem = visit(item);
            if (newItem !== item) {
              value[index] = newItem;
            }
          }
        });
      }
    }
  });
}
