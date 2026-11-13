import { describe, expect, it, vi } from "vitest";
import { injectStyles, mountPane } from "../../../shared/design/pane";
import { FakeElement, fakeDocument } from "./fakeDom";

// esbuild loads these as text; here they are stand-ins.
vi.mock("../../../shared/design/tokens.css", () => ({ default: "TOKENS" }));
vi.mock("../../../shared/design/bundle.css", () => ({ default: "BUNDLE" }));
vi.mock("../../../shared/design/bgs-mark.svg", () => ({ default: "<svg/>" }));
vi.mock("../../../shared/design/runLog.html", () => ({ default: "<div id=\"runLog\"></div>" }));
vi.mock("../../../shared/design/footer.html", () => ({ default: "<footer>credits</footer>" }));

type Slots = { runLog: FakeElement[]; footer: FakeElement[]; mark: FakeElement[] };

function documentWithRoot(slots: Slots | null) {
  const selectors: Record<string, FakeElement[]> =
    slots === null ? {} : { "[data-bgs-runlog]": slots.runLog, "[data-bgs-footer]": slots.footer, "[data-bgs-mark]": slots.mark };
  const bySelector = (selector: string): FakeElement[] => selectors[selector] ?? [];
  const root = slots === null ? null : Object.assign(new FakeElement("div"), { querySelectorAll: bySelector });
  return { ...fakeDocument(), getElementById: (id: string) => (id === "root" ? root : null), root };
}

describe("mountPane", () => {
  it("fills #root, replaces every run log and footer slot and fills every mark slot", () => {
    const slots = { runLog: [new FakeElement("div")], footer: [new FakeElement("div")], mark: [new FakeElement("span"), new FakeElement("span")] };
    const doc = documentWithRoot(slots);
    const root = mountPane(doc as unknown as Document, "<form></form>");
    expect(root).toBe(doc.root);
    expect(doc.root?.innerHTML).toBe("<form></form>");
    expect(slots.runLog[0].outerHTML).toBe("<div id=\"runLog\"></div>");
    expect(slots.footer[0].outerHTML).toBe("<footer>credits</footer>");
    expect(slots.mark.map((m) => m.innerHTML)).toEqual(["<svg/>", "<svg/>"]);
  });

  it("logs clicks on every bug report link", () => {
    const href = "https://github.com/Thomhopstaken/BGS-UtilityTools/issues/new/choose";
    const link = Object.assign(new FakeElement("a"), { href });
    const doc = documentWithRoot({ runLog: [], footer: [], mark: [] });
    doc.root!.querySelectorAll = (selector: string) => (selector === "[data-bgs-bug-report]" ? [link] : []);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    mountPane(doc as unknown as Document, "");
    link.dispatch("click");
    expect(info).toHaveBeenCalledWith(`bug report link clicked: ${href}`);
    info.mockRestore();
  });

  it("throws without #root", () => {
    expect(() => mountPane(documentWithRoot(null) as unknown as Document, "")).toThrow("Pane root element #root not found.");
  });
});

describe("injectStyles", () => {
  it("puts the design system styles first, then the tool's own, in one style element", () => {
    const doc = fakeDocument();
    injectStyles(doc as unknown as Document, "EXTRA");
    const [style] = doc.head.children as FakeElement[];
    expect(style.tag).toBe("style");
    expect(style.textContent).toBe("TOKENS\nBUNDLE\nEXTRA");
  });
});
