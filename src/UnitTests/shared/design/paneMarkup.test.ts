import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The markup is plain text (esbuild text loader), so it is read from disk; paths are from the repo root.
function read(path: string): string {
  return readFileSync(path, "utf-8");
}

const PANES = [
  { tool: "NameChanger", path: "src/NameChanger/ui/pane.html" },
  { tool: "Prefixer", path: "src/Prefixer/ui/pane.html" },
];

describe.each(PANES)("$tool pane markup", ({ tool, path }) => {
  const markup = read(path);

  it("titles the pane BGS-UtilityTools - tool name, with the product name in its own span", () => {
    expect(markup).toContain(`<h1 class="bgs-pane-title"><span class="bgs-pane-title__product">BGS-UtilityTools -</span> ${tool}</h1>`);
  });

  it("has the mark, run log and footer slots once each", () => {
    for (const slot of ["data-bgs-mark", "data-bgs-runlog", "data-bgs-footer"]) {
      expect(markup.split(slot).length - 1).toBe(1);
    }
  });

  it("puts the footer slot last in the stack", () => {
    expect(markup.trimEnd()).toMatch(/<div data-bgs-footer><\/div>\s*<\/div>\s*<\/div>$/);
  });
});

describe("footer markup", () => {
  it("is the credits line", () => {
    expect(read("src/shared/design/footer.html").trim()).toBe('<footer class="bgs-pane-footer">Made by Thom Hopstaken · Blue Green Solutions</footer>');
  });
});
