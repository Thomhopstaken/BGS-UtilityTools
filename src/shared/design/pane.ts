import tokens from "./tokens.css";
import bundle from "./bundle.css";
import mark from "./bgs-mark.svg";
import runLog from "./runLog.html";
import footer from "./footer.html";

// Design system styles first, then the tool's own; all in one <style> element.
export function injectStyles(doc: Document, ...extra: string[]): void {
  const style = doc.createElement("style");
  style.textContent = [tokens, bundle, ...extra].join("\n");
  doc.head.append(style);
  console.debug(`styles injected: ${style.textContent.length} chars`);
}

// Puts the pane markup in #root, the RunLog component in place of every [data-bgs-runlog] slot, the credits footer in
// place of every [data-bgs-footer] slot and the BGS mark in every [data-bgs-mark] slot.
export function mountPane(doc: Document, markup: string): HTMLElement {
  const root = doc.getElementById("root");
  if (root === null) {
    throw new Error("Pane root element #root not found.");
  }
  root.innerHTML = markup;
  root.querySelectorAll("[data-bgs-runlog]").forEach((slot) => {
    slot.outerHTML = runLog;
  });
  root.querySelectorAll("[data-bgs-footer]").forEach((slot) => {
    slot.outerHTML = footer;
  });
  root.querySelectorAll("[data-bgs-mark]").forEach((slot) => {
    slot.innerHTML = mark;
  });
  console.info("pane mounted");
  return root;
}
