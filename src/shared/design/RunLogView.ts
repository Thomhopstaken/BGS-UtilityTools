import { createElement, requireElement } from "./dom";
import { type CountedTone, countLabel, countRows, isOpenByDefault, onlyProblems, type RowTarget, type RunLog, type RunLogGroup } from "./runLog";

// The RunLog component's DOM (runLog.html, mounted in a [data-bgs-runlog] slot); every element is looked up once.
export class RunLogView {
  private readonly doc: Document;
  private readonly runLog: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly groups: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly counts: Record<CountedTone, HTMLElement>;
  private readonly onlyProblemsBox: HTMLInputElement;
  private readonly clearButton: HTMLButtonElement;
  // Kept to re-render when the only-problems filter changes.
  private lastLog: RunLog | null = null;
  private openHandler: ((target: RowTarget) => void) | null = null;

  constructor(root: HTMLElement) {
    this.doc = root.ownerDocument;
    this.runLog = requireElement(root, "#runLog", HTMLElement);
    this.meta = requireElement(root, "#runLogMeta", HTMLElement);
    this.groups = requireElement(root, "#runLogGroups", HTMLElement);
    this.empty = requireElement(root, "#runLogEmpty", HTMLElement);
    this.counts = {
      success: requireElement(root, "#countSuccess", HTMLElement),
      warning: requireElement(root, "#countWarning", HTMLElement),
      error: requireElement(root, "#countError", HTMLElement),
    };
    this.onlyProblemsBox = requireElement(root, "#onlyProblems", HTMLInputElement);
    this.clearButton = requireElement(root, "#clearLog", HTMLButtonElement);
    this.onlyProblemsBox.addEventListener("change", () => this.renderGroups());
    console.debug("run log view bound");
  }

  onClear(handler: () => void): void {
    this.clearButton.addEventListener("click", handler);
  }

  // A row with a target was clicked.
  onOpenDocument(handler: (target: RowTarget) => void): void {
    this.openHandler = handler;
  }

  // null hides the run log.
  show(log: RunLog | null, meta: string): void {
    this.lastLog = log;
    this.runLog.hidden = log === null;
    this.onlyProblemsBox.checked = false;
    this.meta.textContent = meta;
    if (log !== null) {
      const counts = countRows(log);
      for (const tone of Object.keys(this.counts) as CountedTone[]) {
        this.counts[tone].textContent = countLabel(tone, counts[tone]);
        this.counts[tone].classList.toggle("bgs-count--zero", counts[tone] === 0);
      }
    }
    this.renderGroups();
  }

  setBusy(busy: boolean): void {
    this.clearButton.disabled = busy;
  }

  private renderGroups(): void {
    if (this.lastLog === null) {
      this.groups.replaceChildren();
      this.empty.hidden = true;
      return;
    }
    const groups = this.onlyProblemsBox.checked ? onlyProblems(this.lastLog.groups) : this.lastLog.groups;
    this.groups.replaceChildren(...groups.map((group) => this.renderGroup(group)));
    this.empty.hidden = groups.length > 0;
  }

  private renderGroup(group: RunLogGroup): HTMLElement {
    const details = createElement(this.doc, "details", "bgs-loggroup");
    details.open = isOpenByDefault(group);
    const summary = details.appendChild(createElement(this.doc, "summary", undefined, group.title));
    summary.appendChild(createElement(this.doc, "span", "bgs-loggroup__n", String(group.rows.length)));
    const list = details.appendChild(createElement(this.doc, "ul", "bgs-logrows"));
    for (const row of group.rows) {
      const item = list.appendChild(createElement(this.doc, "li", `bgs-logrow bgs-logrow--${row.tone}`));
      const target = row.target;
      if (target === undefined) {
        item.appendChild(createElement(this.doc, "span", "bgs-logrow__what", row.what));
      } else {
        const link = item.appendChild(createElement(this.doc, "button", "bgs-logrow__what bgs-logrow__link", row.what));
        link.type = "button";
        link.title = "Open in Studio Pro";
        link.addEventListener("click", () => this.openHandler?.(target));
      }
      if (row.note !== undefined) {
        item.appendChild(createElement(this.doc, "span", "bgs-logrow__note", row.note));
      }
    }
    return details;
  }
}
