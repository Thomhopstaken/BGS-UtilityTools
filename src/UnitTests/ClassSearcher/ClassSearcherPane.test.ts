import { describe, expect, it, vi } from "vitest";
import {
  type ClassSearcherDeps,
  ClassSearcherPane,
  type ClassSearcherViewPort,
  countOf,
  outcomeOf,
  type SearchResults,
} from "../../ClassSearcher/ClassSearcherPane";
import type { ClassSearchResult } from "../../ClassSearcher/search/classSearch";
import type { ClassMatch } from "../../ClassSearcher/search/findClassUsages";
import type { Status } from "../../shared/design/status";

class FakeView implements ClassSearcherViewPort {
  query = "";
  fieldErrors: string[] = [];
  outcome: Status[] = [];
  // Every status shown, also the ones cleared later.
  shown: Status[] = [];
  results: (SearchResults | null)[] = [];
  busy: boolean[] = [];

  readQuery(): string {
    return this.query;
  }
  clearQuery(): void {
    this.query = "";
  }
  showFieldError(message: string): void {
    this.fieldErrors.push(message);
  }
  clearFieldError(): void {
    this.fieldErrors = [];
  }
  showOutcome(status: Status): void {
    this.outcome.push(status);
    this.shown.push(status);
  }
  clearOutcome(): void {
    this.outcome = [];
  }
  showResults(results: SearchResults | null): void {
    this.results.push(results);
  }
  setBusy(busy: boolean): void {
    this.busy.push(busy);
  }
}

// A match right under its document; null is the document's own Class field.
function match(documentId: string, elementId: string | null): ClassMatch {
  return {
    document: { id: documentId, qualifiedName: `Sales.${documentId}`, kind: "page" },
    parent: null,
    element: elementId === null ? null : { id: elementId, label: elementId, type: "" },
    hits: [{ field: "class", value: "card", ranges: [[0, 4]] }],
  };
}

function result(matches: ClassMatch[], documentsSearched = 3): ClassSearchResult {
  return { className: "card", matches, documentsSearched };
}

function setup(overrides: Partial<ClassSearcherDeps> = {}) {
  const view = new FakeView();
  const deps = {
    search: vi.fn(async () => result([match("A", "c1"), match("A", "c2"), match("B", null)])),
    open: vi.fn(async () => undefined),
    now: () => new Date(2026, 10, 6, 12, 0, 0),
    ...overrides,
  };
  return { view, deps, pane: new ClassSearcherPane(view, deps) };
}

describe("ClassSearcherPane.submit", () => {
  it("shows a field error for an invalid class name and doesn't search", async () => {
    const { view, deps, pane } = setup();
    view.query = "card big";
    await pane.submit();
    expect(view.fieldErrors).toEqual(["Enter one class name, without spaces."]);
    expect(deps.search).not.toHaveBeenCalled();
    expect(view.busy).toEqual([]);
  });

  it("searches the normalized class name and shows the results", async () => {
    const { view, deps, pane } = setup();
    view.query = " .card ";
    await pane.submit();
    expect(deps.search).toHaveBeenCalledWith("card");
    expect(view.shown[0]).toEqual({ tone: "info", text: "Searching for card in pages, snippets, layouts, building blocks and page templates…" });
    expect(view.outcome).toEqual([{ tone: "success", text: "Found 3 elements using card in 2 documents." }]);
    const shown = view.results[view.results.length - 1];
    expect(shown).toMatchObject({ meta: "12:00:00 · 0.0 s", elements: 3, documents: 2 });
    expect(shown?.nodes.map((node) => node.label)).toEqual(["Sales.A", "Sales.B"]);
    expect(view.busy).toEqual([true, false]);
  });

  it("hides the old results while searching", async () => {
    const { view, pane } = setup();
    view.query = "card";
    await pane.submit();
    expect(view.results[0]).toBeNull();
  });

  it("warns when nothing uses the class, and shows no results", async () => {
    const { view, pane } = setup({ search: async () => result([], 12) });
    view.query = "card";
    await pane.submit();
    expect(view.outcome).toEqual([{ tone: "warning", text: "No element uses card in 12 documents." }]);
    expect(view.results).toEqual([null]);
  });

  it("shows an error when the search fails", async () => {
    const { view, pane } = setup({ search: async () => Promise.reject(new Error("offline")) });
    view.query = "card";
    await pane.submit();
    expect(view.outcome).toEqual([{ tone: "error", text: "Search failed: offline" }]);
    expect(view.busy).toEqual([true, false]);
  });

  it("ignores a submit while a search runs", async () => {
    let finish: (value: ClassSearchResult) => void = () => undefined;
    const search = vi.fn(() => new Promise<ClassSearchResult>((resolve) => (finish = resolve)));
    const { view, pane } = setup({ search });
    view.query = "card";
    const first = pane.submit();
    await pane.submit();
    finish(result([]));
    await first;
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("ClassSearcherPane.open", () => {
  it("opens the target", async () => {
    const { deps, pane } = setup();
    await pane.open({ documentId: "A", elementId: "c1" });
    expect(deps.open).toHaveBeenCalledWith({ documentId: "A", elementId: "c1" });
  });

  it("shows an error when the document can't be opened", async () => {
    const { view, pane } = setup({ open: async () => Promise.reject("gone") });
    await pane.open({ documentId: "A" });
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not open the document: gone" }]);
  });
});

describe("ClassSearcherPane.clear", () => {
  it("empties the class name, clears the outcome and hides the results", async () => {
    const { view, pane } = setup();
    view.query = "card";
    await pane.submit();
    pane.clear();
    expect(view.query).toBe("");
    expect(view.outcome).toEqual([]);
    expect(view.results[view.results.length - 1]).toBeNull();
  });

  it("clears a field error", async () => {
    const { view, pane } = setup();
    view.query = "card big";
    await pane.submit();
    pane.clear();
    expect(view.fieldErrors).toEqual([]);
  });
});

describe("countOf", () => {
  it("uses the singular for one", () => {
    expect([countOf(0, "element", "elements"), countOf(1, "element", "elements"), countOf(2, "element", "elements")]).toEqual([
      "0 elements",
      "1 element",
      "2 elements",
    ]);
  });
});

describe("outcomeOf", () => {
  it("is a success with the counts, or a warning without results", () => {
    expect(outcomeOf("card", 1, 1, 5)).toEqual({ tone: "success", text: "Found 1 element using card in 1 document." });
    expect(outcomeOf("card", 0, 0, 1)).toEqual({ tone: "warning", text: "No element uses card in 1 document." });
  });
});
