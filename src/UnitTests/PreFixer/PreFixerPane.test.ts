import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { confirmQuestion, type PreFixerDeps, PreFixerPane, type PreFixerViewPort, previewText } from "../../PreFixer/PreFixerPane";
import { COMMIT_FIRST_WARNING } from "../../shared/design/confirm";
import type { PreFixerData, PrefixOption } from "../../PreFixer/prefixModel";
import { PrefixPlan } from "../../PreFixer/framework/PrefixPlan";
import type { PrefixRunResult } from "../../PreFixer/prefixService";
import type { PrefixField } from "../../PreFixer/validation";
import type { RunLog } from "../../shared/design/runLog";
import type { Status } from "../../shared/design/status";
import { JobReport } from "../../shared/rename/JobReport";
import { changed, fakeUnitInfo } from "../shared/helpers/fakes";
import { MF } from "./helpers/fakeModel";

const act: PrefixOption = { key: "flows:ACT", group: "flows", groupLabel: "Microflows & nanoflows", prefix: "ACT", count: 3, example: "ACT_Order_Save" };
const pop: PrefixOption = { key: "pages:POP", group: "pages", groupLabel: "Pages", prefix: "POP", count: 1, example: "POP_Order_Edit" };
const data: PreFixerData = { excludedModules: new Set(["System"]), prefixes: [act, pop] };

class FakeView implements PreFixerViewPort {
  request = { prefixKey: "", newPrefix: "", removePrefix: false };
  prefixes: (readonly PrefixOption[])[] = [];
  previews: (string | null)[] = [];
  fieldErrors: { field: PrefixField; message: string }[] = [];
  outcome: Status[] = [];
  runLogs: (RunLog | null)[] = [];
  busy: boolean[] = [];
  resets = 0;

  setPrefixes(options: readonly PrefixOption[]): void {
    this.prefixes.push(options);
  }
  readRequest() {
    return this.request;
  }
  showPreview(text: string | null): void {
    this.previews.push(text);
  }
  showFieldError(field: PrefixField, message: string): void {
    this.fieldErrors.push({ field, message });
  }
  clearFieldErrors(): void {
    this.fieldErrors = [];
  }
  showOutcome(status: Status): void {
    this.outcome.push(status);
  }
  clearOutcome(): void {
    this.outcome = [];
  }
  showRunLog(log: RunLog | null): void {
    this.runLogs.push(log);
  }
  setBusy(busy: boolean): void {
    this.busy.push(busy);
  }
  resetForm(): void {
    this.resets++;
  }
}

function result(renamedCount = 1, dialog = "Success"): PrefixRunResult {
  const report = new JobReport();
  for (let i = 0; i < renamedCount; i++) {
    report.addResult("Rename", fakeUnitInfo(`mf-${i}`, MF, "M", `ACT_X${i}_Y`), changed({ renamedVariables: 0, renamedTo: `SUB_X${i}_Y` }));
  }
  return { dialog: { result: dialog } as ProgressDialogResult, report, plan: new PrefixPlan(), change: { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" } };
}

function setup(overrides: Partial<PreFixerDeps> = {}) {
  const view = new FakeView();
  const deps = {
    loadData: vi.fn(async () => data),
    rename: vi.fn(async () => result()),
    openDocument: vi.fn(async () => undefined),
    confirm: vi.fn(async () => true),
    now: () => new Date(2026, 10, 2, 12, 0, 0),
    ...overrides,
  };
  return { view, deps, pane: new PreFixerPane(view, deps) };
}

describe("PreFixerPane.load", () => {
  it("shows the prefixes and the preview", async () => {
    const { view, pane } = setup();
    await pane.load();
    expect(view.prefixes).toEqual([[act, pop]]);
    expect(view.previews).toEqual([null]);
  });

  it("shows an error when the prefixes can't be loaded", async () => {
    const { view, pane } = setup({ loadData: async () => Promise.reject(new Error("offline")) });
    await pane.load();
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not load the prefixes: offline" }]);
    expect(view.prefixes).toEqual([]);
  });
});

describe("PreFixerPane.updatePreview", () => {
  it("shows an example for a valid new prefix or removal, nothing otherwise", async () => {
    const { view, pane } = setup();
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    pane.updatePreview();
    view.request = { prefixKey: "flows:ACT", newPrefix: "", removePrefix: true };
    pane.updatePreview();
    view.request = { prefixKey: "flows:ACT", newPrefix: "S2", removePrefix: false };
    pane.updatePreview();
    view.request = { prefixKey: "", newPrefix: "SUB", removePrefix: false };
    pane.updatePreview();
    expect(view.previews.slice(1)).toEqual(["ACT_Order_Save → SUB_Order_Save", "ACT_Order_Save → Order_Save", null, null]);
  });
});

describe("PreFixerPane.submit", () => {
  it("marks the field of an invalid request and runs nothing", async () => {
    const { view, deps, pane } = setup();
    await pane.load();
    view.request = { prefixKey: "", newPrefix: "SUB", removePrefix: false };
    await pane.submit();
    expect(view.fieldErrors).toEqual([{ field: "prefix", message: "Select a prefix." }]);
    view.request = { prefixKey: "flows:ACT", newPrefix: "ACT", removePrefix: false };
    await pane.submit();
    expect(view.fieldErrors).toEqual([{ field: "newPrefix", message: "The new prefix is the same as the current prefix." }]);
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it("asks first and does nothing when declined", async () => {
    const { view, deps, pane } = setup({ confirm: vi.fn(async () => false) });
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    await pane.submit();
    expect(deps.confirm).toHaveBeenCalledWith(confirmQuestion(act, { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" }));
    expect(deps.rename).not.toHaveBeenCalled();
    expect(view.busy).toEqual([true, false]);
  });

  it("ignores a second submit while the confirmation is open", async () => {
    let answer: (yes: boolean) => void = () => undefined;
    const { view, deps, pane } = setup({ confirm: vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve))) });
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    const first = pane.submit();
    await pane.submit();
    expect(deps.confirm).toHaveBeenCalledOnce();
    answer(true);
    await first;
    expect(deps.rename).toHaveBeenCalledOnce();
  });

  it("reports a failing confirmation and runs nothing", async () => {
    const { view, deps, pane } = setup({ confirm: async () => Promise.reject(new Error("no dialog")) });
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    await pane.submit();
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not ask for confirmation: no dialog" }]);
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it("runs the change, shows the outcome and run log, then reloads and resets the form", async () => {
    const { view, deps, pane } = setup();
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    await pane.submit();
    expect(deps.rename).toHaveBeenCalledWith({ group: "flows", oldPrefix: "ACT", newPrefix: "SUB" }, { excludedModules: data.excludedModules });
    expect(view.outcome).toEqual([{ tone: "success", text: "Renamed 1 document (ACT_ → SUB_)." }]);
    expect(view.runLogs[0]).toBeNull();
    expect(view.runLogs.at(-1)?.groups.map((g) => g.title)).toEqual(["Renamed documents", "Check yourself"]);
    expect(view.busy).toEqual([true, false]);
    expect(view.resets).toBe(1);
    expect(deps.loadData).toHaveBeenCalledTimes(2);
  });

  it("sends a removal as a null new prefix", async () => {
    const { view, deps, pane } = setup();
    await pane.load();
    view.request = { prefixKey: "pages:POP", newPrefix: "", removePrefix: true };
    await pane.submit();
    expect(deps.rename).toHaveBeenCalledWith({ group: "pages", oldPrefix: "POP", newPrefix: null }, expect.anything());
  });

  it("keeps the form and prefixes when nothing changed", async () => {
    const { view, deps, pane } = setup({ rename: vi.fn(async () => result(0)) });
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    await pane.submit();
    expect(view.resets).toBe(0);
    expect(deps.loadData).toHaveBeenCalledTimes(1);
  });

  it("keeps the outcome and warns when the reload fails", async () => {
    let loads = 0;
    const { view, pane } = setup({ loadData: async () => (loads++ === 0 ? data : Promise.reject(new Error("busy"))) });
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    await pane.submit();
    expect(view.outcome).toEqual([
      { tone: "success", text: "Renamed 1 document (ACT_ → SUB_)." },
      { tone: "warning", text: "Could not reload the prefixes: busy" },
    ]);
  });

  it("shows an error when the run throws, and is no longer busy", async () => {
    const { view, pane } = setup({ rename: async () => Promise.reject(new Error("crash")) });
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    await pane.submit();
    expect(view.outcome).toEqual([{ tone: "error", text: "Rename failed: crash" }]);
    expect(view.busy).toEqual([true, false]);
  });

  it("ignores a second submit while running", async () => {
    let finish: (value: PrefixRunResult) => void = () => undefined;
    const rename = vi.fn(() => new Promise<PrefixRunResult>((resolve) => (finish = resolve)));
    const { view, pane } = setup({ rename });
    await pane.load();
    view.request = { prefixKey: "flows:ACT", newPrefix: "SUB", removePrefix: false };
    const first = pane.submit();
    await vi.waitFor(() => expect(rename).toHaveBeenCalledOnce());
    await pane.submit();
    finish(result());
    await first;
    expect(rename).toHaveBeenCalledOnce();
  });
});

describe("PreFixerPane.openDocument and clearLog", () => {
  it("opens a document, or shows why it couldn't", async () => {
    const openDocument = vi.fn(async () => Promise.reject(new Error("gone")));
    const { view, pane } = setup({ openDocument });
    await pane.openDocument({ documentId: "mf-1" });
    expect(openDocument).toHaveBeenCalledWith({ documentId: "mf-1" });
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not open the document: gone" }]);
  });

  it("clears the outcome and hides the run log", () => {
    const { view, pane } = setup();
    view.outcome = [{ tone: "info", text: "x" }];
    pane.clearLog();
    expect(view.outcome).toEqual([]);
    expect(view.runLogs).toEqual([null]);
  });
});

describe("previewText and confirmQuestion", () => {
  it("previews a rename and a removal", () => {
    expect(previewText(act, "SUB")).toBe("ACT_Order_Save → SUB_Order_Save");
    expect(previewText(act, null)).toBe("ACT_Order_Save → Order_Save");
    expect(previewText(act, "act")).toBeNull();
  });

  it("asks with the count, the type group and the commit advice", () => {
    expect(confirmQuestion(act, { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" })).toMatch(
      /^Rename 3 documents \(Microflows & nanoflows\) from ACT_ to SUB_, and update every reference to them\?\n\nCommit your app first/,
    );
    expect(confirmQuestion(act, { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" }).endsWith(`\n\n${COMMIT_FIRST_WARNING}`)).toBe(true);
    expect(confirmQuestion(pop, { group: "pages", oldPrefix: "POP", newPrefix: null })).toMatch(/^Remove prefix POP_ from 1 document \(Pages\)/);
  });
});
