import type { RowTarget } from "../../shared/design/runLog";
import type { TreeField, TreeNode } from "../../shared/design/tree";
import { kindInfo } from "../documentKinds";
import type { ClassField, ClassMatch, FieldHit } from "../search/findClassUsages";
import type { StructureNode } from "../search/structure";

// Field keys as the tree shows them; short, so the values line up.
const FIELD_KEYS: Readonly<Record<ClassField, string>> = { class: "Class", dynamicClasses: "Dynamic" };

type Draft = {
  readonly label: string;
  readonly type: string;
  readonly target: RowTarget;
  readonly fields: TreeField[];
  // Map keeps the model order the matches came in.
  readonly children: Map<string, Draft>;
};

// Document › parent widget › element holding the class (lead, 2026-11-06). One root per document, sorted by
// qualified name; an element without a parent widget sits right under its document. Children keep the model order:
// a parent comes where its first result is.
export function buildResultTree(matches: readonly ClassMatch[]): TreeNode[] {
  const documents = new Map<string, Draft>();
  for (const { document, parent, element, hits } of matches) {
    let root = documents.get(document.id);
    if (root === undefined) {
      root = newDraft(document.qualifiedName, kindInfo(document.kind).caption, { documentId: document.id });
      documents.set(document.id, root);
    }
    // A widget can be a result and the parent of another result, so the two get their own keys.
    const holder = parent === null ? root : childOf(root, `parent:${parent.id}`, parent, document.id);
    const target = element === null ? root : childOf(holder, `element:${element.id}`, element, document.id);
    target.fields.push(...hits.map(toField));
  }
  const roots = [...documents.values()].map(toNode).sort((a, b) => a.label.localeCompare(b.label));
  console.debug(`result tree: ${roots.length} documents from ${matches.length} matches`);
  return roots;
}

// Matching elements under all roots.
export function countResults(roots: readonly TreeNode[]): number {
  return roots.reduce((sum, root) => sum + root.count, 0);
}

function newDraft(label: string, type: string, target: RowTarget): Draft {
  return { label, type, target, fields: [], children: new Map() };
}

function childOf(draft: Draft, key: string, node: StructureNode, documentId: string): Draft {
  let child = draft.children.get(key);
  if (child === undefined) {
    child = newDraft(node.label, node.type, { documentId, elementId: node.id });
    draft.children.set(key, child);
  }
  return child;
}

function toField(hit: FieldHit): TreeField {
  return { key: FIELD_KEYS[hit.field], value: hit.value, hits: hit.ranges };
}

function toNode(draft: Draft): TreeNode {
  const children = [...draft.children.values()].map(toNode);
  const count = (draft.fields.length > 0 ? 1 : 0) + children.reduce((sum, child) => sum + child.count, 0);
  return { label: draft.label, type: draft.type, target: draft.target, fields: draft.fields, children, count };
}
