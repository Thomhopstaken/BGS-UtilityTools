import { withCommitWarning } from "../shared/design/confirm";
import { type RowTarget, type RunLog, runLogMeta } from "../shared/design/runLog";
import type { Status } from "../shared/design/status";
import type { PrefixerData, PrefixOption } from "./prefixModel";
import { type PrefixChange, renameWithPrefix } from "./prefixRename";
import { jobTitle, type PrefixRunResult } from "./prefixService";
import { buildPrefixRunLog } from "./ui/runLog";
import { type PrefixField, validateNewPrefix, validatePrefixRequest } from "./validation";

// What the pane controller needs from the DOM; PaneView implements it, tests fake it.
export interface PrefixerViewPort {
  setPrefixes(options: readonly PrefixOption[], selectedKey?: string): void;
  readRequest(): { prefixKey: string; newPrefix: string; removePrefix: boolean };
  // null hides the preview line.
  showPreview(text: string | null): void;
  showFieldError(field: PrefixField, message: string): void;
  clearFieldErrors(): void;
  showOutcome(status: Status): void;
  clearOutcome(): void;
  // null hides the run log.
  showRunLog(log: RunLog | null, meta: string): void;
  setBusy(busy: boolean): void;
  // Empties the new prefix and unticks Remove prefix.
  resetForm(): void;
}

export type PrefixerDeps = {
  loadData(): Promise<PrefixerData>;
  rename(change: PrefixChange, scope: { readonly excludedModules: ReadonlySet<string> }): Promise<PrefixRunResult>;
  // Opens the document in Studio Pro's editor.
  openDocument(target: RowTarget): Promise<void>;
  // Yes/no question in Studio Pro; true to go ahead.
  confirm(question: string): Promise<boolean>;
  // Clock for the run log's timing; new Date() when absent.
  now?(): Date;
};

// The Prefixer pane without the DOM: loading prefixes, validating, confirming, renaming, reporting.
export class PrefixerPane {
  private readonly view: PrefixerViewPort;
  private readonly deps: PrefixerDeps;
  private data: PrefixerData = { excludedModules: new Set(), prefixes: [] };
  private busy = false;

  constructor(view: PrefixerViewPort, deps: PrefixerDeps) {
    this.view = view;
    this.deps = deps;
  }

  async load(): Promise<void> {
    console.info("prefixer: loading prefixes");
    try {
      this.data = await this.deps.loadData();
    } catch (error: unknown) {
      console.info(`prefixer: loading failed: ${error}`);
      this.view.showOutcome({ tone: "error", text: `Could not load the prefixes: ${errorMessage(error)}` });
      return;
    }
    this.view.setPrefixes(this.data.prefixes);
    this.updatePreview();
    console.info(`prefixer: ${this.data.prefixes.length} prefixes loaded`);
  }

  // Called on every form change: the preview line for the current input.
  updatePreview(): void {
    const request = this.view.readRequest();
    const option = this.option(request.prefixKey);
    const text = option === undefined ? null : previewText(option, request.removePrefix ? null : request.newPrefix);
    this.view.showPreview(text);
  }

  // Validates the form, asks for confirmation, then runs; ignored while a run is going.
  async submit(): Promise<void> {
    if (this.busy) {
      console.debug("prefixer: submit ignored, a rename is running");
      return;
    }
    this.view.clearFieldErrors();
    this.view.clearOutcome();
    const request = this.view.readRequest();
    const option = this.option(request.prefixKey);
    const problem = validatePrefixRequest({ oldPrefix: option?.prefix, newPrefix: request.newPrefix, removePrefix: request.removePrefix });
    if (problem !== null || option === undefined) {
      console.info(`prefixer: request invalid: ${problem?.message}`);
      if (problem !== null) {
        this.view.showFieldError(problem.field, problem.message);
      }
      return;
    }
    const change: PrefixChange = { group: option.group, oldPrefix: option.prefix, newPrefix: request.removePrefix ? null : request.newPrefix };
    // Busy from the question on, so a second submit can't ask again.
    this.setBusy(true);
    try {
      if (await this.confirm(option, change)) {
        await this.run(change);
      }
    } finally {
      this.setBusy(false);
    }
  }

  // A run log row was clicked.
  async openDocument(target: RowTarget): Promise<void> {
    console.info(`prefixer: opening document ${target.documentId}`);
    try {
      await this.deps.openDocument(target);
    } catch (error: unknown) {
      console.info(`prefixer: opening document ${target.documentId} failed: ${error}`);
      this.view.showOutcome({ tone: "error", text: `Could not open the document: ${errorMessage(error)}` });
    }
  }

  clearLog(): void {
    console.debug("prefixer: run log cleared");
    this.view.clearOutcome();
    this.view.showRunLog(null, "");
  }

  private option(key: string): PrefixOption | undefined {
    return this.data.prefixes.find((option) => option.key === key);
  }

  private async confirm(option: PrefixOption, change: PrefixChange): Promise<boolean> {
    try {
      const yes = await this.deps.confirm(confirmQuestion(option, change));
      console.info(`prefixer: confirmation ${yes ? "given" : "declined"}`);
      return yes;
    } catch (error: unknown) {
      console.info(`prefixer: confirmation failed: ${error}`);
      this.view.showOutcome({ tone: "error", text: `Could not ask for confirmation: ${errorMessage(error)}` });
      return false;
    }
  }

  private async run(change: PrefixChange): Promise<void> {
    this.view.showRunLog(null, "");
    this.view.showOutcome({ tone: "info", text: `${jobTitle(change)}…` });
    const started = this.now();
    try {
      const result = await this.deps.rename(change, { excludedModules: this.data.excludedModules });
      const log = buildPrefixRunLog(result.dialog, result.report, change);
      this.view.clearOutcome();
      this.view.showOutcome(log.outcome);
      this.view.showRunLog(log, runLogMeta(started, this.now()));
      if (result.report.changedUnits > 0) {
        // Counts and prefixes changed; the selection is cleared by the reload.
        this.view.resetForm();
        await this.reload();
      }
    } catch (error: unknown) {
      console.info(`prefixer: rename failed: ${error}`);
      this.view.clearOutcome();
      this.view.showOutcome({ tone: "error", text: `Rename failed: ${errorMessage(error)}` });
    }
  }

  // After a run: fresh prefixes; a failure keeps the outcome and only adds a warning.
  private async reload(): Promise<void> {
    try {
      this.data = await this.deps.loadData();
      this.view.setPrefixes(this.data.prefixes);
      this.updatePreview();
    } catch (error: unknown) {
      console.info(`prefixer: reload failed: ${error}`);
      this.view.showOutcome({ tone: "warning", text: `Could not reload the prefixes: ${errorMessage(error)}` });
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.view.setBusy(busy);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

// "ACT_Order_Save → SUB_Order_Save"; null while the new prefix is not valid.
export function previewText(option: PrefixOption, newPrefix: string | null): string | null {
  if (newPrefix !== null && validateNewPrefix(option.prefix, newPrefix) !== null) {
    return null;
  }
  const renamed = renameWithPrefix(option.example, { group: option.group, oldPrefix: option.prefix, newPrefix });
  return renamed === null ? null : `${option.example} → ${renamed}`;
}

export function confirmQuestion(option: PrefixOption, change: PrefixChange): string {
  const documents = option.count === 1 ? "1 document" : `${option.count} documents`;
  const action =
    change.newPrefix === null
      ? `Remove prefix ${change.oldPrefix}_ from ${documents} (${option.groupLabel})`
      : `Rename ${documents} (${option.groupLabel}) from ${change.oldPrefix}_ to ${change.newPrefix}_`;
  return withCommitWarning(`${action}, and update every reference to them?`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
