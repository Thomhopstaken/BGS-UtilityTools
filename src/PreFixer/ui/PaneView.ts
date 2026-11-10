import { requireElement } from "../../shared/design/dom";
import { appendStatus, fillGroupedSelect, type SelectGroup } from "../../shared/design/forms";
import type { RowTarget, RunLog } from "../../shared/design/runLog";
import { RunLogView } from "../../shared/design/RunLogView";
import type { Status } from "../../shared/design/status";
import type { PreFixerViewPort } from "../PreFixerPane";
import type { PrefixOption } from "../prefixModel";
import type { PrefixField } from "../validation";

// The PreFixer pane's DOM (pane.html); every element is looked up once, so a markup mismatch fails at load.
export class PaneView implements PreFixerViewPort {
  private readonly doc: Document;
  private readonly form: HTMLFormElement;
  private readonly prefixSelect: HTMLSelectElement;
  private readonly newPrefixInput: HTMLInputElement;
  private readonly removePrefixBox: HTMLInputElement;
  private readonly preview: HTMLElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly errors: Record<PrefixField, { control: HTMLInputElement | HTMLSelectElement; message: HTMLElement }>;
  private readonly outcome: HTMLElement;
  private readonly runLog: RunLogView;
  private busy = false;

  constructor(root: HTMLElement) {
    this.doc = root.ownerDocument;
    this.form = requireElement(root, "#prefixForm", HTMLFormElement);
    this.prefixSelect = requireElement(root, "#prefixDropdown", HTMLSelectElement);
    this.newPrefixInput = requireElement(root, "#newPrefixInput", HTMLInputElement);
    this.removePrefixBox = requireElement(root, "#removePrefixBox", HTMLInputElement);
    this.preview = requireElement(root, "#preview", HTMLElement);
    this.submitButton = requireElement(root, "#renamePrefix", HTMLButtonElement);
    this.errors = {
      prefix: { control: this.prefixSelect, message: requireElement(root, "#prefixError", HTMLElement) },
      newPrefix: { control: this.newPrefixInput, message: requireElement(root, "#newPrefixError", HTMLElement) },
    };
    this.outcome = requireElement(root, "#outcome", HTMLElement);
    this.runLog = new RunLogView(root);
    // Prefixes are always capitals (lead's rule), so the input is uppercased as it is typed.
    this.newPrefixInput.addEventListener("input", () => {
      this.newPrefixInput.value = this.newPrefixInput.value.toUpperCase();
      this.clearError("newPrefix");
    });
    this.prefixSelect.addEventListener("change", () => this.clearError("prefix"));
    this.removePrefixBox.addEventListener("change", () => this.applyRemoveMode());
    console.debug("prefixer view bound");
  }

  onSubmit(handler: () => void): void {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      handler();
    });
  }

  // Any input changed; for the preview line.
  onChange(handler: () => void): void {
    for (const control of [this.prefixSelect, this.newPrefixInput, this.removePrefixBox]) {
      control.addEventListener(control === this.newPrefixInput ? "input" : "change", handler);
    }
  }

  onClearLog(handler: () => void): void {
    this.runLog.onClear(handler);
  }

  // A run log row with a target was clicked.
  onOpenDocument(handler: (target: RowTarget) => void): void {
    this.runLog.onOpenDocument(handler);
  }

  // One option group per document type group: "ACT_ (12)".
  setPrefixes(options: readonly PrefixOption[], selectedKey = ""): void {
    const groups = new Map<string, SelectGroup & { items: { value: string; text: string }[] }>();
    for (const option of options) {
      const group = groups.get(option.group) ?? { label: option.groupLabel, items: [] };
      group.items.push({ value: option.key, text: `${option.prefix}_ (${option.count})` });
      groups.set(option.group, group);
    }
    const placeholder = options.length === 0 ? "-- No prefixes found --" : "-- Select a prefix --";
    fillGroupedSelect(this.doc, this.prefixSelect, placeholder, [...groups.values()], selectedKey);
    console.debug(`prefix picker: ${options.length} prefixes in ${groups.size} groups, selected '${this.prefixSelect.value}'`);
  }

  readRequest(): { prefixKey: string; newPrefix: string; removePrefix: boolean } {
    return {
      prefixKey: this.prefixSelect.value,
      newPrefix: this.newPrefixInput.value.trim(),
      removePrefix: this.removePrefixBox.checked,
    };
  }

  showPreview(text: string | null): void {
    this.preview.hidden = text === null;
    this.preview.textContent = text === null ? "" : `Example: ${text}`;
  }

  showFieldError(field: PrefixField, message: string): void {
    const { control, message: line } = this.errors[field];
    control.setAttribute("aria-invalid", "true");
    line.textContent = message;
    line.hidden = false;
    control.focus();
    console.debug(`field error on ${field}: ${message}`);
  }

  clearFieldErrors(): void {
    for (const field of Object.keys(this.errors) as PrefixField[]) {
      this.clearError(field);
    }
  }

  showOutcome(status: Status): void {
    appendStatus(this.doc, this.outcome, status);
  }

  clearOutcome(): void {
    this.outcome.replaceChildren();
  }

  showRunLog(log: RunLog | null, meta: string): void {
    this.runLog.show(log, meta);
  }

  // Second guard next to the modal progress dialog: no new run can start while one is busy.
  setBusy(busy: boolean): void {
    this.busy = busy;
    for (const control of [this.prefixSelect, this.removePrefixBox, this.submitButton]) {
      control.disabled = busy;
    }
    this.runLog.setBusy(busy);
    this.applyRemoveMode();
    console.debug(`prefixer busy: ${busy}`);
  }

  resetForm(): void {
    this.newPrefixInput.value = "";
    this.removePrefixBox.checked = false;
    this.applyRemoveMode();
    console.debug("prefixer form reset");
  }

  // Remove prefix ticked: the new prefix is not used, so it is emptied and disabled.
  private applyRemoveMode(): void {
    if (this.removePrefixBox.checked) {
      this.newPrefixInput.value = "";
      this.clearError("newPrefix");
    }
    this.newPrefixInput.disabled = this.busy || this.removePrefixBox.checked;
  }

  private clearError(field: PrefixField): void {
    const { control, message } = this.errors[field];
    control.removeAttribute("aria-invalid");
    message.textContent = "";
    message.hidden = true;
  }
}
