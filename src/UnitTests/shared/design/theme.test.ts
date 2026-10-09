import type { Preferences } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { applyTheme, themeAttribute } from "../../../shared/design/theme";

// Only documentElement's attribute calls are used.
function fakeDocument(initial: string | null = null) {
  const attributes = new Map<string, string>(initial === null ? [] : [["data-theme", initial]]);
  return {
    attributes,
    documentElement: {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    },
  };
}

describe("themeAttribute", () => {
  it("maps Dark to dark and Light to no attribute", () => {
    expect(themeAttribute("Dark")).toBe("dark");
    expect(themeAttribute("Light")).toBeNull();
  });
});

describe("applyTheme", () => {
  it("sets data-theme for the dark theme", () => {
    const doc = fakeDocument();
    applyTheme(doc as unknown as Document, { theme: "Dark" } as Preferences);
    expect(doc.attributes.get("data-theme")).toBe("dark");
  });

  it("removes data-theme for the light theme", () => {
    const doc = fakeDocument("dark");
    applyTheme(doc as unknown as Document, { theme: "Light" } as Preferences);
    expect(doc.attributes.has("data-theme")).toBe(false);
  });
});
