// A model element seen as a plain record, so the walker can read and write any property.
export type ModelElement = Record<string, unknown> & { $Type: string };

// Types already logged, so each element type is logged once per session.
const loggedTypes = new Set<string>();

export function isElement(value: unknown): value is ModelElement {
  return typeof value === "object" && value !== null && typeof (value as { $Type?: unknown }).$Type === "string";
}

// Depth-first over every nested object and array; calls visit for each element ($Type), root included.
// `$`-prefixed keys ($ID, $Type, $Container...) are skipped. Elements are visited once (cycle guard).
// UNVERIFIED: Studio Pro element proxies enumerate their properties with Object.keys.
export function walkElements(root: object, visit: (element: ModelElement) => void): void {
  const seen = new WeakSet<object>();
  const walk = (value: unknown): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const keys = Object.keys(value).filter((key) => !key.startsWith("$"));
    if (isElement(value)) {
      logFirstVisit(value.$Type, keys);
      visit(value);
    }
    for (const key of keys) {
      walk((value as Record<string, unknown>)[key]);
    }
  };
  walk(root);
}

function logFirstVisit(type: string, keys: string[]): void {
  if (loggedTypes.has(type)) {
    return;
  }
  loggedTypes.add(type);
  if (keys.length === 0) {
    console.info(`walker: ${type} has no enumerable properties`);
  } else {
    console.debug(`walker: ${type} [${keys.join(", ")}]`);
  }
}
