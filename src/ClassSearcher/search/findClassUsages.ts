import type { TextRange } from "../../shared/design/tree";
import { type ModelElement, walkElementsWithPath } from "../../shared/rename/rewrite/elementWalker";
import type { DocumentKind } from "../documentKinds";
import { classRanges, expressionRanges } from "./classTokens";
import { elementNode, parentNode, type StructureNode } from "./structure";

export type ClassField = "class" | "dynamicClasses";

// One field of an element's appearance that holds the class.
export type FieldHit = {
  readonly field: ClassField;
  readonly value: string;
  readonly ranges: readonly TextRange[];
};

export type SearchedDocument = {
  readonly id: string;
  readonly qualifiedName: string;
  readonly kind: DocumentKind;
};

export type ClassMatch = {
  readonly document: SearchedDocument;
  // The nearest named widget above the element; null when there is none.
  readonly parent: StructureNode | null;
  // The element holding the class; null when it is the document's own Class field. Its id stays so a later tool
  // can change the element.
  readonly element: StructureNode | null;
  readonly hits: readonly FieldHit[];
};

// The Class and Dynamic classes fields of the element's appearance that hold the class.
export function appearanceHits(element: ModelElement, className: string): FieldHit[] {
  const appearance = element.appearance as { class?: unknown; dynamicClasses?: unknown } | null | undefined;
  if (typeof appearance !== "object" || appearance === null) {
    return [];
  }
  const hits: FieldHit[] = [];
  if (typeof appearance.class === "string") {
    const ranges = classRanges(appearance.class, className);
    if (ranges.length > 0) {
      hits.push({ field: "class", value: appearance.class, ranges });
    }
  }
  if (typeof appearance.dynamicClasses === "string") {
    const ranges = expressionRanges(appearance.dynamicClasses, className);
    if (ranges.length > 0) {
      hits.push({ field: "dynamicClasses", value: appearance.dynamicClasses, ranges });
    }
  }
  return hits;
}

// Every element of one page, snippet, layout, building block or page template that uses the class.
export function findClassUsages(unit: object, document: SearchedDocument, className: string): ClassMatch[] {
  const matches: ClassMatch[] = [];
  walkElementsWithPath(unit, (place, ancestors) => {
    const hits = appearanceHits(place.element, className);
    if (hits.length === 0) {
      return;
    }
    // The root is the document itself.
    const isDocument = ancestors.length === 0;
    const parent = isDocument ? null : parentNode(ancestors);
    const element = isDocument ? null : elementNode(place);
    matches.push({ document, parent, element, hits });
    console.debug(`class searcher: ${[document.qualifiedName, parent?.label, element?.label].filter((label) => label !== undefined).join(" › ")}`);
  });
  return matches;
}
