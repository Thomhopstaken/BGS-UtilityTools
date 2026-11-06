import { requireElement } from "../../shared/design/dom";
import { appendStatus } from "../../shared/design/forms";
import type { RowTarget } from "../../shared/design/runLog";
import type { Status } from "../../shared/design/status";
import { TreeView } from "../../shared/design/TreeView";
import { type ClassSearcherViewPort, countOf, type SearchResults } from "../ClassSearcherPane";

// The ClassSearcher pane's DOM (pane.html); every element is looked up once, so a markup mismatch fails at load.
export class PaneView implements ClassSearcherViewPort {
  private readonly doc: Document;
  private readonly form: HTMLFormElement;
  private readonly classInput: HTMLInputElement;
  private readonly classError: HTMLElement;
  private readonly searchButton: HTMLButtonElement;
  private readonly outcome: HTMLElement;
  private readonly results: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly countElements: HTMLElement;
  private readonly countDocuments: HTMLElement;
  private readonly expandAllButton: HTMLButtonElement;
  private readonly collapseAllButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly tree: TreeView;

  constructor(root: HTMLElement) {
    this.doc = root.ownerDocument;
    this.form = requireElement(root, "#classForm", HTMLFormElement);
    this.classInput = requireElement(root, "#classInput", HTMLInputElement);
    this.classError = requireElement(root, "#classError", HTMLElement);
    this.searchButton = requireElement(root, "#searchButton", HTMLButtonElement);
    this.outcome = requireElement(root, "#outcome", HTMLElement);
    this.results = requireElement(root, "#results", HTMLElement);
    this.meta = requireElement(root, "#resultsMeta", HTMLElement);
    this.countElements = requireElement(root, "#countElements", HTMLElement);
    this.countDocuments = requireElement(root, "#countDocuments", HTMLElement);
    this.expandAllButton = requireElement(root, "#expandAll", HTMLButtonElement);
    this.collapseAllButton = requireElement(root, "#collapseAll", HTMLButtonElement);
    this.clearButton = requireElement(root, "#clearResults", HTMLButtonElement);
    this.tree = new TreeView(requireElement(root, "#resultTree", HTMLUListElement));
    this.classInput.addEventListener("input", () => this.clearFieldError());
    this.expandAllButton.addEventListener("click", () => this.tree.expandAll());
    this.collapseAllButton.addEventListener("click", () => this.tree.collapseAll());
    console.debug("class searcher view bound");
  }

  onSubmit(handler: () => void): void {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      handler();
    });
  }

  // A result row label was clicked.
  onOpen(handler: (target: RowTarget) => void): void {
    this.tree.onOpen(handler);
  }

  onClear(handler: () => void): void {
    this.clearButton.addEventListener("click", handler);
  }

  readQuery(): string {
    return this.classInput.value;
  }

  // Empties the field and puts the cursor in it for the next search.
  clearQuery(): void {
    this.classInput.value = "";
    this.classInput.focus();
  }

  showFieldError(message: string): void {
    this.classInput.setAttribute("aria-invalid", "true");
    this.classInput.setAttribute("aria-describedby", "classHelp classError");
    this.classError.textContent = message;
    this.classError.hidden = false;
    this.classInput.focus();
    console.debug(`field error on class name: ${message}`);
  }

  clearFieldError(): void {
    this.classInput.removeAttribute("aria-invalid");
    this.classInput.setAttribute("aria-describedby", "classHelp");
    this.classError.textContent = "";
    this.classError.hidden = true;
  }

  showOutcome(status: Status): void {
    appendStatus(this.doc, this.outcome, status);
  }

  clearOutcome(): void {
    this.outcome.replaceChildren();
  }

  showResults(results: SearchResults | null): void {
    this.results.hidden = results === null;
    this.meta.textContent = results?.meta ?? "";
    this.countElements.textContent = results === null ? "" : countOf(results.elements, "element", "elements");
    this.countDocuments.textContent = results === null ? "" : countOf(results.documents, "document", "documents");
    this.tree.show(results?.nodes ?? []);
  }

  setBusy(busy: boolean): void {
    for (const control of [this.classInput, this.searchButton, this.expandAllButton, this.collapseAllButton, this.clearButton]) {
      control.disabled = busy;
    }
    console.debug(`class searcher busy: ${busy}`);
  }
}
