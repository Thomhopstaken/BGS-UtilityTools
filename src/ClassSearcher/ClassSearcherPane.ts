import { type RowTarget, runLogMeta } from "../shared/design/runLog";
import type { Status } from "../shared/design/status";
import type { TreeNode } from "../shared/design/tree";
import { searchedKindsText } from "./documentKinds";
import { buildResultTree, countResults } from "./results/resultTree";
import type { ClassSearchResult } from "./search/classSearch";
import { normalizeClassQuery } from "./validation";

// What the results frame shows after a search with matches.
export type SearchResults = {
  readonly nodes: readonly TreeNode[];
  // "14:02:11 · 2.3 s"
  readonly meta: string;
  readonly elements: number;
  readonly documents: number;
};

// What the pane controller needs from the DOM; PaneView implements it, tests fake it.
export interface ClassSearcherViewPort {
  readQuery(): string;
  // Empties the class name field.
  clearQuery(): void;
  showFieldError(message: string): void;
  clearFieldError(): void;
  showOutcome(status: Status): void;
  clearOutcome(): void;
  // null hides the results.
  showResults(results: SearchResults | null): void;
  setBusy(busy: boolean): void;
}

export type ClassSearcherDeps = {
  search(className: string): Promise<ClassSearchResult>;
  // Opens the document in Studio Pro; with an elementId it also selects that element.
  open(target: RowTarget): Promise<void>;
  // Clock for the results' timing; new Date() when absent.
  now?(): Date;
};

// The ClassSearcher pane without the DOM: validating, searching, reporting, opening results.
export class ClassSearcherPane {
  private readonly view: ClassSearcherViewPort;
  private readonly deps: ClassSearcherDeps;
  private busy = false;

  constructor(view: ClassSearcherViewPort, deps: ClassSearcherDeps) {
    this.view = view;
    this.deps = deps;
  }

  // Validates the class name, then searches; ignored while a search runs.
  async submit(): Promise<void> {
    if (this.busy) {
      console.debug("class searcher: submit ignored, a search is running");
      return;
    }
    this.view.clearFieldError();
    this.view.clearOutcome();
    const query = normalizeClassQuery(this.view.readQuery());
    if (!query.ok) {
      console.info(`class searcher: query invalid: ${query.message}`);
      this.view.showFieldError(query.message);
      return;
    }
    this.setBusy(true);
    try {
      await this.search(query.className);
    } finally {
      this.setBusy(false);
    }
  }

  // A result row was clicked.
  async open(target: RowTarget): Promise<void> {
    console.info(`class searcher: opening ${target.documentId}${target.elementId === undefined ? "" : ` at ${target.elementId}`}`);
    try {
      await this.deps.open(target);
    } catch (error: unknown) {
      console.info(`class searcher: opening ${target.documentId} failed: ${error}`);
      this.view.showOutcome({ tone: "error", text: `Could not open the document: ${errorMessage(error)}` });
    }
  }

  // Clear button: empties the class name, the outcome and the results.
  clear(): void {
    console.debug("class searcher: search cleared");
    this.view.clearQuery();
    this.view.clearFieldError();
    this.view.clearOutcome();
    this.view.showResults(null);
  }

  private async search(className: string): Promise<void> {
    this.view.showResults(null);
    this.view.showOutcome({ tone: "info", text: `Searching for ${className} in ${searchedKindsText()}…` });
    const started = this.now();
    try {
      const result = await this.deps.search(className);
      const nodes = buildResultTree(result.matches);
      const elements = countResults(nodes);
      this.view.clearOutcome();
      this.view.showOutcome(outcomeOf(className, elements, nodes.length, result.documentsSearched));
      if (nodes.length > 0) {
        this.view.showResults({ nodes, meta: runLogMeta(started, this.now()), elements, documents: nodes.length });
      }
    } catch (error: unknown) {
      console.info(`class searcher: search failed: ${error}`);
      this.view.clearOutcome();
      this.view.showOutcome({ tone: "error", text: `Search failed: ${errorMessage(error)}` });
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.view.setBusy(busy);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

// "1 element", "3 elements"
export function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function outcomeOf(className: string, elements: number, documents: number, searched: number): Status {
  if (elements === 0) {
    return { tone: "warning", text: `No element uses ${className} in ${countOf(searched, "document", "documents")}.` };
  }
  return {
    tone: "success",
    text: `Found ${countOf(elements, "element", "elements")} using ${className} in ${countOf(documents, "document", "documents")}.`,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
