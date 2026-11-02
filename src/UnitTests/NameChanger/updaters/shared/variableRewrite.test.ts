import { describe, expect, it } from "vitest";
import { rewriteExpression, rewriteName } from "../../../../NameChanger/updaters/shared/variableRewrite";

const renames = new Map([["Order", "Purchase"]]);

describe("rewriteExpression", () => {
  it.each([
    ["$Order/Name", "$Purchase/Name"],
    ["$Order = empty and $Order/Total > 0", "$Purchase = empty and $Purchase/Total > 0"],
    ["[MyModule.Order_Customer = $Order]", "[MyModule.Order_Customer = $Purchase]"],
    ["$OrderLine/Amount", "$OrderLine/Amount"],
    ["$order/Name", "$order/Name"],
    ["'$Order' + $Order/Name", "'$Order' + $Purchase/Name"],
    ["'it''s $Order' + $Order", "'it''s $Order' + $Purchase"],
    ["$currentObject/Name", "$currentObject/Name"],
    ["", ""],
  ])("rewrites '%s' to '%s'", (value, expected) => {
    expect(rewriteExpression(value, renames)).toBe(expected);
  });

  it("returns the value unchanged without renames", () => {
    expect(rewriteExpression("$Order", new Map())).toBe("$Order");
  });
});

describe("rewriteName", () => {
  it("renames an exact match only", () => {
    expect(rewriteName("Order", renames)).toBe("Purchase");
    expect(rewriteName("OrderLine", renames)).toBe("OrderLine");
    expect(rewriteName("order", renames)).toBe("order");
  });
});
