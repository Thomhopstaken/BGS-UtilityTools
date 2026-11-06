import { createElement } from "./dom";
import type { RowTarget } from "./runLog";
import { markParts, type TreeField, type TreeNode } from "./tree";

// A level with children: its chevron and the list it folds.
type Fold = {
  readonly label: string;
  readonly toggle: HTMLButtonElement;
  readonly group: HTMLElement;
  open: boolean;
};

// The Tree component's DOM: renders TreeNodes into a <ul class="bgs-tree">. Every level starts open.
// A root row's chevron opens its whole structure; a deeper chevron opens one level (lead, 2026-11-06).
export class TreeView {
  private readonly doc: Document;
  private readonly list: HTMLElement;
  private folds: Fold[] = [];
  private openHandler: ((target: RowTarget) => void) | null = null;

  constructor(list: HTMLElement) {
    this.doc = list.ownerDocument;
    this.list = list;
    console.debug("tree view bound");
  }

  // A row label was clicked.
  onOpen(handler: (target: RowTarget) => void): void {
    this.openHandler = handler;
  }

  show(nodes: readonly TreeNode[]): void {
    this.folds = [];
    this.list.replaceChildren(...nodes.map((node) => this.renderItem(node, true)));
    console.debug(`tree: ${nodes.length} root rows, ${this.folds.length} levels with children`);
  }

  expandAll(): void {
    this.folds.forEach((fold) => setOpen(fold, true));
  }

  collapseAll(): void {
    this.folds.forEach((fold) => setOpen(fold, false));
  }

  private renderItem(node: TreeNode, isRoot: boolean): HTMLLIElement {
    const item = createElement(this.doc, "li");
    const row = item.appendChild(createElement(this.doc, "div", rowClass(node, isRoot)));
    const toggle = node.children.length > 0 ? row.appendChild(createElement(this.doc, "button", "bgs-tree__toggle")) : null;
    if (toggle === null) {
      row.appendChild(createElement(this.doc, "span", "bgs-tree__spacer"));
    }
    const label = row.appendChild(createElement(this.doc, "button", "bgs-tree__label", node.label));
    label.type = "button";
    label.title = "Open in Studio Pro";
    label.addEventListener("click", () => this.openHandler?.(node.target));
    if (node.type !== "") {
      row.appendChild(createElement(this.doc, "span", "bgs-tree__type", node.type));
    }
    if (isRoot) {
      const count = row.appendChild(createElement(this.doc, "span", "bgs-tree__n", String(node.count)));
      count.title = node.count === 1 ? "1 result" : `${node.count} results`;
    }
    if (node.fields.length > 0) {
      const fields = item.appendChild(createElement(this.doc, "div", "bgs-tree__fields"));
      node.fields.forEach((field) => fields.appendChild(this.renderField(field)));
    }
    if (toggle !== null) {
      const group = item.appendChild(createElement(this.doc, "ul", "bgs-tree__group"));
      const firstDescendant = this.folds.length;
      node.children.forEach((child) => group.appendChild(this.renderItem(child, false)));
      // Folds below this one, pushed while rendering the children.
      const descendants = this.folds.slice(firstDescendant);
      const fold: Fold = { label: node.label, toggle, group, open: true };
      toggle.type = "button";
      toggle.addEventListener("click", () => {
        const open = !fold.open;
        setOpen(fold, open);
        if (open && isRoot) {
          descendants.forEach((descendant) => setOpen(descendant, true));
        }
        console.debug(`tree: ${open ? "opened" : "closed"} ${node.label}${open && isRoot ? ` with ${descendants.length} levels below` : ""}`);
      });
      setOpen(fold, true);
      this.folds.push(fold);
    }
    return item;
  }

  private renderField(field: TreeField): HTMLElement {
    const line = createElement(this.doc, "div", "bgs-tree__field");
    line.appendChild(createElement(this.doc, "span", "bgs-tree__key", field.key));
    const value = line.appendChild(createElement(this.doc, "span", "bgs-tree__value"));
    for (const part of markParts(field.value, field.hits)) {
      value.appendChild(part.hit ? createElement(this.doc, "mark", "bgs-hit", part.text) : this.doc.createTextNode(part.text));
    }
    return line;
  }
}

function rowClass(node: TreeNode, isRoot: boolean): string {
  return ["bgs-tree__row", isRoot ? "bgs-tree__row--root" : "", node.fields.length > 0 ? "bgs-tree__row--match" : ""]
    .filter((name) => name !== "")
    .join(" ");
}

function setOpen(fold: Fold, open: boolean): void {
  fold.open = open;
  fold.toggle.setAttribute("aria-expanded", String(open));
  fold.toggle.setAttribute("aria-label", `${open ? "Collapse" : "Expand"} ${fold.label}`);
  fold.group.hidden = !open;
}
