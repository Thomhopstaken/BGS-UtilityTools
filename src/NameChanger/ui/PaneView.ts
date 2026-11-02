import { requireElement } from "../../shared/design/dom";
import { appendStatus, fillSelect } from "../../shared/design/forms";
import type { RowTarget, RunLog } from "../../shared/design/runLog";
import { RunLogView } from "../../shared/design/RunLogView";
import type { Status } from "../../shared/design/status";
import type { EntityOption } from "../entityPicker";
import type { PaneViewPort } from "../NameChangerPane";
import type { PaneField } from "../validation";

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
  private readonly runLog: RunLogView;
  // Read by setEntities, so a refill keeps the entity picker disabled during a run.
  private busy = false;

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
    this.runLog = new RunLogView(root);
    this.nameInput.addEventListener("input", () => this.clearError("name"));
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
    this.runLog.onClear(handler);
  }

  // A run log row with a target was clicked.
  onOpenDocument(handler: (target: RowTarget) => void): void {
    this.runLog.onOpenDocument(handler);
  }

  setModules(names: readonly string[], selected = ""): void {
    fillSelect(this.doc, this.moduleSelect, "-- Select a module --", names.map((name) => ({ value: name, text: name })), selected);
    console.debug(`module picker: ${names.length} modules, selected '${this.moduleSelect.value}'`);
  }

  setEntities(options: readonly EntityOption[] | null, selectedId = ""): void {
    const placeholder = options === null ? "-- Select a module first --" : "-- Select an entity --";
    fillSelect(this.doc, this.entitySelect, placeholder, (options ?? []).map((o) => ({ value: o.id, text: o.name })), selectedId);
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
    for (const control of [this.moduleSelect, this.nameInput, this.exposedNamesBox, this.submitButton]) {
      control.disabled = busy;
    }
    this.runLog.setBusy(busy);
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
}
