import { describe, expect, it } from "vitest";
import { fakeContext, fakeUnitInfo } from "../helpers/fakes";
import { isEntityQname, isInScope } from "../../../EntityNameChanger/framework/RenameContext";

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

describe("isInScope", () => {
  const context = fakeContext({ excludedModules: new Set(["System", "Marketplace"]) });

  it("accepts units of own modules", () => {
    expect(isInScope(fakeUnitInfo("u", "T", "MyModule"), context)).toBe(true);
  });

  it("rejects excluded modules", () => {
    expect(isInScope(fakeUnitInfo("u", "T", "Marketplace"), context)).toBe(false);
    expect(isInScope(fakeUnitInfo("u", "T", "System"), context)).toBe(false);
  });

  it("rejects units without a module", () => {
    expect(isInScope({ $ID: "u", $Type: "T" } as never, context)).toBe(false);
  });
});
