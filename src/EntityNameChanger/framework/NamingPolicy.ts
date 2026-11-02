// Replaces the old entity name inside names, except where it is part of another entity's name.
// Matching is exact-case: Mendix names are case-sensitive.
export class NamingPolicy {
  readonly oldName: string;
  readonly newName: string;
  readonly protectedNames: readonly string[];

  constructor(oldName: string, newName: string, protectedNames: readonly string[]) {
    this.oldName = oldName;
    this.newName = newName;
    // A new name containing the old one (Order -> OrderItem) is protected too, so a rerun stays idempotent.
    this.protectedNames =
      oldName.length > 0 && newName.includes(oldName) ? [...protectedNames, newName] : [...protectedNames];
  }

  contains(name: string): boolean {
    return this.findOccurrences(name).length > 0;
  }

  rename(name: string): string {
    const occurrences = this.findOccurrences(name);
    if (occurrences.length === 0) {
      return name;
    }
    let result = "";
    let position = 0;
    for (const start of occurrences) {
      result += name.slice(position, start) + this.newName;
      position = start + this.oldName.length;
    }
    result += name.slice(position);
    console.debug(`naming: '${name}' -> '${result}'`);
    return result;
  }

  // Start indexes of non-overlapping old-name occurrences that are not inside a protected name.
  private findOccurrences(name: string): number[] {
    let index = this.oldName.length === 0 ? -1 : name.indexOf(this.oldName);
    // Most names don't hold the entity name; skip the protected-name scan for them.
    if (index === -1) {
      return [];
    }
    const protectedSpans = this.findProtectedSpans(name);
    const occurrences: number[] = [];
    while (index !== -1) {
      const end = index + this.oldName.length;
      // Inside a protected name: search again one character further.
      if (protectedSpans.some(([spanStart, spanEnd]) => index >= spanStart && end <= spanEnd)) {
        index = name.indexOf(this.oldName, index + 1);
        continue;
      }
      occurrences.push(index);
      index = name.indexOf(this.oldName, end);
    }
    return occurrences;
  }

  // [start, end) of every protected name occurrence in name.
  private findProtectedSpans(name: string): [number, number][] {
    const spans: [number, number][] = [];
    for (const protectedName of this.protectedNames) {
      let index = name.indexOf(protectedName);
      while (index !== -1) {
        spans.push([index, index + protectedName.length]);
        index = name.indexOf(protectedName, index + 1);
      }
    }
    return spans;
  }
}

// Names of other entities that contain oldName, e.g. OrderLine and PurchaseOrder for Order.
export function getProtectedNames(entityNames: readonly string[], oldName: string): string[] {
  const names = new Set<string>();
  for (const name of entityNames) {
    if (name !== oldName && oldName.length > 0 && name.includes(oldName)) {
      names.add(name);
    }
  }
  return [...names];
}
