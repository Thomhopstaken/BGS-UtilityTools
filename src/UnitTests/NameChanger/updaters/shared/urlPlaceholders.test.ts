import { describe, expect, it } from "vitest";
import { rewriteUrlPlaceholders } from "../../../../NameChanger/updaters/shared/urlPlaceholders";

const renames = new Map([["Order", "Purchase"]]);

describe("rewriteUrlPlaceholders", () => {
  it.each([
    ["{Order}", "{Purchase}"],
    ["orders/{Order}/lines", "orders/{Purchase}/lines"],
    ["order/{Order/Number}", "order/{Purchase/Number}"],
    ["{OrderLine}/{Order}", "{OrderLine}/{Purchase}"],
    ["Order/{Customer}", "Order/{Customer}"],
    ["{Order", "{Order"],
  ])("%s -> %s", (url, expected) => {
    expect(rewriteUrlPlaceholders(url, renames)).toBe(expected);
  });

  it("returns the url unchanged without renames", () => {
    expect(rewriteUrlPlaceholders("{Order}", new Map())).toBe("{Order}");
  });
});
