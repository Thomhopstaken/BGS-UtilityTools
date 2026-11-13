import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The markup is plain text (esbuild text loader), so it is read from disk; paths are from the repo root.
function read(path: string): string {
  return readFileSync(path, "utf-8");
}

const WITH_RUN_LOG = ["data-bgs-mark", "data-bgs-runlog", "data-bgs-footer"];

const PANES = [
  { tool: "NameChanger", path: "src/NameChanger/ui/pane.html", slots: WITH_RUN_LOG },
  { tool: "PreFixer", path: "src/PreFixer/ui/pane.html", slots: WITH_RUN_LOG },
  // Shows its results in a tree, not in the run log.
  { tool: "ClassSearcher", path: "src/ClassSearcher/ui/pane.html", slots: ["data-bgs-mark", "data-bgs-footer"] },
];

describe.each(PANES)("$tool pane markup", ({ tool, path, slots }) => {
  const markup = read(path);

  it("titles the pane BGS-UtilityTools - tool name, with the product name in its own span", () => {
    expect(markup).toContain(`<h1 class="bgs-pane-title"><span class="bgs-pane-title__product">BGS-UtilityTools -</span> ${tool}</h1>`);
  });

  it("has its slots once each", () => {
    for (const slot of slots) {
      expect(markup.split(slot).length - 1).toBe(1);
    }
  });

  it("starts every groupbox closed", () => {
    const groupboxes = markup.match(/<details class="bgs-groupbox"[^>]*>/g) ?? [];
    expect(groupboxes.length).toBeGreaterThan(0);
    expect(groupboxes.every((tag) => !/\sopen\b/.test(tag))).toBe(true);
  });

  it("puts the footer slot last in the stack", () => {
    expect(markup.trimEnd()).toMatch(/<div data-bgs-footer><\/div>\s*<\/div>\s*<\/div>$/);
  });
});

describe("ClassSearcher pane markup", () => {
  const markup = read("src/ClassSearcher/ui/pane.html");

  it("has every element PaneView looks up, once", () => {
    const ids = ["classForm", "classInput", "classHelp", "classError", "searchButton", "outcome", "results", "resultsMeta", "countElements", "countDocuments", "expandAll", "collapseAll", "clearResults", "resultTree"];
    for (const id of ids) {
      expect(markup.split(`id="${id}"`).length - 1, id).toBe(1);
    }
  });

  it("starts with the results hidden", () => {
    expect(markup).toContain('<div class="bgs-runlog" id="results" hidden>');
  });
});

describe("footer markup", () => {
  const markup = read("src/shared/design/footer.html");
  const issuesUrl = "https://github.com/Thomhopstaken/BGS-UtilityTools/issues/new/choose";

  it("has the credits line", () => {
    expect(markup).toContain('<p class="bgs-pane-footer__line">Made by Thom Hopstaken · Blue Green Solutions</p>');
  });

  it("links to the GitHub issue chooser in a new window", () => {
    expect(markup).toContain(
      `Found a bug? <a class="bgs-link" data-bgs-bug-report href="${issuesUrl}" target="_blank" rel="noopener noreferrer">Report it on GitHub</a>`,
    );
  });

  it("doesn't show the URL as text", () => {
    expect(markup).not.toContain("bgs-pane-footer__url");
    expect(markup.split(issuesUrl).length - 1).toBe(1);
  });
});

describe("footer styles", () => {
  const css = read("src/shared/design/bundle.css");

  it("styles the footer lines and the link", () => {
    for (const selector of [".bgs-pane-footer__line {", ".bgs-link {", ".bgs-link:focus-visible {"]) {
      expect(css, selector).toContain(selector);
    }
    expect(css).not.toContain(".bgs-pane-footer__url");
  });
});
