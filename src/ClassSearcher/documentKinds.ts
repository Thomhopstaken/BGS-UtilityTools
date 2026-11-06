// The document types the ClassSearcher searches, in search order (lead's scope, 2026-11-06).
export type DocumentKind = "page" | "snippet" | "layout" | "buildingBlock" | "pageTemplate";

export type DocumentKindInfo = {
  readonly kind: DocumentKind;
  readonly unitType: string;
  // Type caption on the tree's document rows.
  readonly caption: string;
  readonly plural: string;
};

// UNVERIFIED: getUnitsInfo of layouts, buildingBlocks and pageTemplates reports these $Types.
export const DOCUMENT_KINDS: readonly DocumentKindInfo[] = [
  { kind: "page", unitType: "Pages$Page", caption: "Page", plural: "pages" },
  { kind: "snippet", unitType: "Pages$Snippet", caption: "Snippet", plural: "snippets" },
  { kind: "layout", unitType: "Pages$Layout", caption: "Layout", plural: "layouts" },
  { kind: "buildingBlock", unitType: "Pages$BuildingBlock", caption: "Building block", plural: "building blocks" },
  { kind: "pageTemplate", unitType: "Pages$PageTemplate", caption: "Page template", plural: "page templates" },
];

export function kindInfo(kind: DocumentKind): DocumentKindInfo {
  const info = DOCUMENT_KINDS.find((candidate) => candidate.kind === kind);
  if (info === undefined) {
    throw new Error(`Unknown document kind '${kind}'.`);
  }
  return info;
}

// "pages, snippets, layouts, building blocks and page templates"
export function searchedKindsText(): string {
  const plurals = DOCUMENT_KINDS.map((info) => info.plural);
  return `${plurals.slice(0, -1).join(", ")} and ${plurals[plurals.length - 1]}`;
}
