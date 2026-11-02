import { describe, expect, it } from "vitest";
import { fakeContext } from "../helpers/fakes";
import { entityRenames, isEntityQname } from "../../../NameChanger/framework/RenameContext";

describe("createRenameContext", () => {
  it("builds the old qualified name and protected names", () => {
    const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
    expect(context.oldQualifiedName).toBe("MyModule.Order");
    expect(context.newQualifiedName).toBe("MyModule.Purchase");
    expect(context.protectedNames).toEqual(["OrderLine"]);
    expect(context.newName).toBe("Purchase");
  });

  it("keeps exposed names unless opted in", () => {
    expect(fakeContext().renameExposedNames).toBe(false);
    expect(fakeContext({ renameExposedNames: true }).renameExposedNames).toBe(true);
  });
});

describe("isEntityQname", () => {
  const context = fakeContext();

  it("accepts the old and the new qualified name", () => {
    expect(isEntityQname("MyModule.Order", context)).toBe(true);
    expect(isEntityQname("MyModule.Purchase", context)).toBe(true);
  });

  it("rejects other names, null and undefined", () => {
    expect(isEntityQname("MyModule.OrderLine", context)).toBe(false);
    expect(isEntityQname("Other.Order", context)).toBe(false);
    expect(isEntityQname("Order", context)).toBe(false);
    expect(isEntityQname(null, context)).toBe(false);
    expect(isEntityQname(undefined, context)).toBe(false);
  });
});

describe("entityRenames", () => {
  it("is seeded with the entity rename, declared by its domain model", () => {
    const renames = entityRenames(fakeContext());
    expect([...renames.map]).toEqual([["MyModule.Order", "MyModule.Purchase"]]);
    expect([...renames.existing((id) => id === "dm-1")]).toEqual([["MyModule.Order", "MyModule.Purchase"]]);
  });
});
