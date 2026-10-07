import { describe, expect, it } from "vitest";
import { fakeContext, fakeUnitInfo } from "../helpers/fakes";
import { isInScope } from "../../../EntityNameChanger/framework/RenameContext";

describe("createRenameContext", () => {
  it("builds the old qualified name and protected names", () => {
    const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
    expect(context.oldQualifiedName).toBe("MyModule.Order");
    expect(context.protectedNames).toEqual(["OrderLine"]);
    expect(context.newName).toBe("Purchase");
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
