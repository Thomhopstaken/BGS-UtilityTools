import { describe, expect, it } from "vitest";
import { DOCUMENT_KINDS, type DocumentKind, kindInfo, searchedKindsText } from "../../ClassSearcher/documentKinds";

describe("DOCUMENT_KINDS", () => {
  it("lists the five searched document types in search order", () => {
    expect(DOCUMENT_KINDS.map((info) => [info.kind, info.unitType, info.caption])).toEqual([
      ["page", "Pages$Page", "Page"],
      ["snippet", "Pages$Snippet", "Snippet"],
      ["layout", "Pages$Layout", "Layout"],
      ["buildingBlock", "Pages$BuildingBlock", "Building block"],
      ["pageTemplate", "Pages$PageTemplate", "Page template"],
    ]);
  });
});

describe("kindInfo", () => {
  it("finds a kind", () => {
    expect(kindInfo("layout").plural).toBe("layouts");
  });

  it("throws on an unknown kind", () => {
    expect(() => kindInfo("workflow" as DocumentKind)).toThrow("Unknown document kind 'workflow'.");
  });
});

describe("searchedKindsText", () => {
  it("names every kind in a sentence", () => {
    expect(searchedKindsText()).toBe("pages, snippets, layouts, building blocks and page templates");
  });
});
