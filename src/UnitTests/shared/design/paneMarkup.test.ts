import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The markup is plain text (esbuild text loader), so it is read from disk; paths are from the repo root.
function read(path: string): string {
  return readFileSync(path, "utf-8");
}

const WITH_RUN_LOG = ["data-bgs-mark", "data-bgs-runlog", "data-bgs-footer"];

const PANES = [
  { tool: "NameChanger", path: "src/NameChanger/ui/pane.html", slots: WITH_RUN_LOG },
  { tool: "Prefixer", path: "src/Prefixer/ui/pane.html", slots: WITH_RUN_LOG },
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
  it("is the credits line", () => {
    expect(read("src/shared/design/footer.html").trim()).toBe('<footer class="bgs-pane-footer">Made by Thom Hopstaken · Blue Green Solutions</footer>');
  });
});
