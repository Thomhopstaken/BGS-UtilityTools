import type { Primitives } from "@mendix/extensions-api";
import { createRenameContext, type RenameContext, type RenameContextInput } from "../../../NameChanger/framework/RenameContext";

// Test-only fakes for the NameChanger; the generic ones are in UnitTests/shared/helpers/fakes.ts.

export function fakeContext(overrides: Partial<RenameContextInput> = {}): RenameContext {
  return createRenameContext({
    entityId: "entity-1",
    domainModelId: "dm-1",
    moduleName: "MyModule",
    oldName: "Order",
    newName: "Purchase",
    excludedModules: new Set(["System"]),
    allEntityNames: ["Order", "Customer"],
    ...overrides,
  });
}

export type FakeResolveAccess = {
  resolve<TElement extends Primitives.ElementBase>(type: TElement["$Type"], qualifiedName: string): Promise<TElement | null>;
  calls: { type: string; qualifiedName: string }[];
};

// Resolves from a map keyed "<type>:<qualified name>"; an Error value is thrown.
export function fakeResolveAccess(elements: Record<string, unknown> = {}): FakeResolveAccess {
  const access: FakeResolveAccess = {
    calls: [],
    async resolve<TElement extends Primitives.ElementBase>(type: TElement["$Type"], qualifiedName: string) {
      access.calls.push({ type, qualifiedName });
      const element = elements[`${type}:${qualifiedName}`];
      if (element instanceof Error) {
        throw element;
      }
      return (element ?? null) as TElement | null;
    },
  };
  return access;
}
