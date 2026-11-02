import { createElement, requireElement } from "../../shared/design/dom";
import { type Status, statusLabel, statusRole } from "../../shared/design/status";
import type { EntityOption } from "../entityPicker";
import type { PaneViewPort } from "../EntityNameChangerPane";
import type { PaneField } from "../validation";
import {
  type CountedTone,
  countLabel,
  countRows,
  isOpenByDefault,
  onlyProblems,
  type RowTarget,
  type RunLog,
  type RunLogGroup,
} from "./runLog";

// The pane's DOM (pane.html); every element is looked up once, so a markup mismatch fails at load.
export class PaneView implements PaneViewPort {
  private readonly doc: Document;
  private readonly form: HTMLFormElement;
  private readonly moduleSelect: HTMLSelectElement;
  private readonly entitySelect: HTMLSelectElement;
  private readonly nameInput: HTMLInputElement;
  private readonly exposedNamesBox: HTMLInputElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly errors: Record<PaneField, { control: HTMLInputElement | HTMLSelectElement; message: HTMLElement }>;
  private readonly outcome: HTMLElement;
  private readonly runLog: HTMLElement;
  private readonly runLogMeta: HTMLElement;
  private readonly runLogGroups: HTMLElement;
  private readonly runLogEmpty: HTMLElement;
  private readonly counts: Record<CountedTone, HTMLElement>;
  private readonly onlyProblemsBox: HTMLInputElement;
  private readonly clearButton: HTMLButtonElement;
  // Kept to re-render when the only-problems filter changes.
  private lastLog: RunLog | null = null;
  // Read by setEntities, so a refill keeps the entity picker disabled during a run.
  private busy = false;
  private openHandler: ((target: RowTarget) => void) | null = null;

  constructor(root: HTMLElement) {
    this.doc = root.ownerDocument;
    this.form = requireElement(root, "#renameForm", HTMLFormElement);
    this.moduleSelect = requireElement(root, "#moduleDropdown", HTMLSelectElement);
    this.entitySelect = requireElement(root, "#entityDropdown", HTMLSelectElement);
    this.nameInput = requireElement(root, "#nameInput", HTMLInputElement);
    this.exposedNamesBox = requireElement(root, "#exposedNamesBox", HTMLInputElement);
    this.submitButton = requireElement(root, "#changeName", HTMLButtonElement);
    this.errors = {
      module: { control: this.moduleSelect, message: requireElement(root, "#moduleError", HTMLElement) },
      entity: { control: this.entitySelect, message: requireElement(root, "#entityError", HTMLElement) },
      name: { control: this.nameInput, message: requireElement(root, "#nameError", HTMLElement) },
    };
    this.outcome = requireElement(root, "#outcome", HTMLElement);
    this.runLog = requireElement(root, "#runLog", HTMLElement);
    this.runLogMeta = requireElement(root, "#runLogMeta", HTMLElement);
    this.runLogGroups = requireElement(root, "#runLogGroups", HTMLElement);
    this.runLogEmpty = requireElement(root, "#runLogEmpty", HTMLElement);
    this.counts = {
      success: requireElement(root, "#countSuccess", HTMLElement),
      warning: requireElement(root, "#countWarning", HTMLElement),
      error: requireElement(root, "#countError", HTMLElement),
    };
    this.onlyProblemsBox = requireElement(root, "#onlyProblems", HTMLInputElement);
    this.clearButton = requireElement(root, "#clearLog", HTMLButtonElement);
    this.nameInput.addEventListener("input", () => this.clearError("name"));
    this.onlyProblemsBox.addEventListener("change", () => this.renderGroups());
    console.debug("pane view bound");
  }

  onSubmit(handler: () => void): void {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      handler();
    });
  }

  onModuleChange(handler: (moduleName: string) => void): void {
    this.moduleSelect.addEventListener("change", () => handler(this.moduleSelect.value));
  }

  onClearLog(handler: () => void): void {
    this.clearButton.addEventListener("click", handler);
  }

  // A run log row with a target was clicked.
  onOpenDocument(handler: (target: RowTarget) => void): void {
    this.openHandler = handler;
  }

  setModules(names: readonly string[], selected = ""): void {
    this.fillSelect(this.moduleSelect, "-- Select a module --", names.map((name) => ({ value: name, text: name })), selected);
    console.debug(`module picker: ${names.length} modules, selected '${this.moduleSelect.value}'`);
  }

  setEntities(options: readonly EntityOption[] | null, selectedId = ""): void {
    const placeholder = options === null ? "-- Select a module first --" : "-- Select an entity --";
    this.fillSelect(this.entitySelect, placeholder, (options ?? []).map((o) => ({ value: o.id, text: o.name })), selectedId);
    this.entitySelect.disabled = this.busy || options === null;
    console.debug(`entity picker: ${options?.length ?? 0} entities, selected '${this.entitySelect.value}'`);
  }

  readRequest(): { moduleName: string; entityId: string; newName: string; renameExposedNames: boolean } {
    return {
      moduleName: this.moduleSelect.value,
      entityId: this.entitySelect.value,
      newName: this.nameInput.value,
      renameExposedNames: this.exposedNamesBox.checked,
    };
  }

  showFieldError(field: PaneField, message: string): void {
    const { control, message: line } = this.errors[field];
    control.setAttribute("aria-invalid", "true");
    line.textContent = message;
    line.hidden = false;
    control.focus();
    console.debug(`field error on ${field}: ${message}`);
  }

  clearFieldErrors(): void {
    for (const field of Object.keys(this.errors) as PaneField[]) {
      this.clearError(field);
    }
  }

  showOutcome(status: Status): void {
    const row = createElement(this.doc, "div", `bgs-status bgs-status--${status.tone}`);
    row.setAttribute("role", statusRole(status.tone));
    row.appendChild(createElement(this.doc, "span", "bgs-status__glyph")).setAttribute("aria-hidden", "true");
    const text = row.appendChild(createElement(this.doc, "span"));
    text.appendChild(createElement(this.doc, "span", "bgs-status__label", `${statusLabel(status.tone)}: `));
    text.appendChild(this.doc.createTextNode(status.text));
    this.outcome.appendChild(row);
  }

  clearOutcome(): void {
    this.outcome.replaceChildren();
  }

  showRunLog(log: RunLog | null, meta: string): void {
    this.lastLog = log;
    this.runLog.hidden = log === null;
    this.onlyProblemsBox.checked = false;
    this.runLogMeta.textContent = meta;
    if (log !== null) {
      const counts = countRows(log);
      for (const tone of Object.keys(this.counts) as CountedTone[]) {
        this.counts[tone].textContent = countLabel(tone, counts[tone]);
        this.counts[tone].classList.toggle("bgs-count--zero", counts[tone] === 0);
      }
    }
    this.renderGroups();
  }

  // Second guard next to the modal progress dialog: no new run can start while one is busy.
  setBusy(busy: boolean): void {
    this.busy = busy;
    for (const control of [this.moduleSelect, this.nameInput, this.exposedNamesBox, this.submitButton, this.clearButton]) {
      control.disabled = busy;
    }
    this.entitySelect.disabled = busy || this.moduleSelect.value === "";
    console.debug(`pane busy: ${busy}`);
  }

  clearNameInput(): void {
    this.nameInput.value = "";
    console.debug("name input cleared");
  }

  private clearError(field: PaneField): void {
    const { control, message } = this.errors[field];
    control.removeAttribute("aria-invalid");
    message.textContent = "";
    message.hidden = true;
  }

  // Placeholder first (empty value); a selection not in items falls back to it.
  private fillSelect(select: HTMLSelectElement, placeholder: string, items: readonly { value: string; text: string }[], selected: string): void {
    const first = createElement(this.doc, "option", undefined, placeholder);
    first.value = "";
    const options = items.map((item) => {
      const option = createElement(this.doc, "option", undefined, item.text);
      option.value = item.value;
      return option;
    });
    select.replaceChildren(first, ...options);
    select.value = items.some((item) => item.value === selected) ? selected : "";
  }

  private renderGroups(): void {
    if (this.lastLog === null) {
      this.runLogGroups.replaceChildren();
      this.runLogEmpty.hidden = true;
      return;
    }
    const groups = this.onlyProblemsBox.checked ? onlyProblems(this.lastLog.groups) : this.lastLog.groups;
    this.runLogGroups.replaceChildren(...groups.map((group) => this.renderGroup(group)));
    this.runLogEmpty.hidden = groups.length > 0;
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
