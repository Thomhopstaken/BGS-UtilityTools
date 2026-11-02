import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import type { Status } from "../../shared/design/status";
import type { EntityOption } from "../../EntityNameChanger/entityPicker";
import { EntityNameChangerPane, type PaneData, type PaneDeps, type PaneViewPort } from "../../EntityNameChanger/EntityNameChangerPane";
import { RenameReport } from "../../EntityNameChanger/framework/RenameReport";
import type { RenameRunResult } from "../../EntityNameChanger/renameService";
import type { RowTarget, RunLog } from "../../EntityNameChanger/ui/runLog";
import type { PaneField } from "../../EntityNameChanger/validation";
import { fakeContext } from "./helpers/fakes";

// entityPicker imports the real package, which needs Studio Pro at runtime.
vi.mock("@mendix/extensions-api", () => ({ getContainer: vi.fn() }));

const option = (name: string, moduleName = "MyModule"): EntityOption => ({ id: `id-${name}`, name, moduleName, domainModelId: `dm-${moduleName}` });

function data(names: Record<string, string[]>): PaneData {
  return {
    excludedModules: new Set(["System"]),
    byModule: new Map(Object.entries(names).map(([module, entities]) => [module, entities.map((n) => option(n, module))])),
  };
}

// Records what the controller asks the view to do; the request is set by the test.
class FakeView implements PaneViewPort {
  request = { moduleName: "", entityId: "", newName: "", renameExposedNames: false };
  modules: { names: readonly string[]; selected?: string }[] = [];
  entities: { options: readonly EntityOption[] | null; selectedId?: string }[] = [];
  fieldErrors: { field: PaneField; message: string }[] = [];
  outcome: Status[] = [];
  runLog: { log: RunLog | null; meta: string } | undefined;
  busy: boolean[] = [];
  nameCleared = 0;

  setModules(names: readonly string[], selected?: string) {
    this.modules.push({ names, selected });
  }
  setEntities(options: readonly EntityOption[] | null, selectedId?: string) {
    this.entities.push({ options, selectedId });
  }
  readRequest() {
    return this.request;
  }
  showFieldError(field: PaneField, message: string) {
    this.fieldErrors.push({ field, message });
  }
  clearFieldErrors() {
    this.fieldErrors = [];
  }
  showOutcome(status: Status) {
    this.outcome.push(status);
  }
  clearOutcome() {
    this.outcome = [];
  }
  showRunLog(log: RunLog | null, meta: string) {
    this.runLog = { log, meta };
  }
  setBusy(busy: boolean) {
    this.busy.push(busy);
  }
  clearNameInput() {
    this.nameCleared++;
  }
}

const context = fakeContext();

function ran(result: ProgressDialogResult["result"], entityRenamed: boolean): RenameRunResult {
  const report = new RenameReport();
  report.entityRenamed = entityRenamed;
  if (!entityRenamed && result === "Success") {
    report.skipEntity("name taken");
  }
  return { kind: "ran", dialog: { result } as ProgressDialogResult, report, context };
}

function setup(rename: PaneDeps["rename"] = async () => ran("Success", true), loads: PaneData[] = [data({ MyModule: ["Order", "Customer"], Other: ["Invoice"] })]) {
  const view = new FakeView();
  const loadData = vi.fn(async () => {
    const next = loads.length > 1 ? loads.shift()! : loads[0];
    return next;
  });
  const renameSpy = vi.fn(rename);
  const openDocument = vi.fn(async (_target: RowTarget) => {});
  let tick = 0;
  const pane = new EntityNameChangerPane(view, { loadData, rename: renameSpy, openDocument, now: () => new Date(2026, 9, 9, 10, 0, tick++) });
  return { view, pane, loadData, rename: renameSpy, openDocument };
}

async function loadedWithRequest(newName: string, rename?: PaneDeps["rename"], loads?: PaneData[]) {
  const s = setup(rename, loads);
  await s.pane.load();
  s.pane.selectModule("MyModule");
  s.view.request = { moduleName: "MyModule", entityId: "id-Order", newName, renameExposedNames: false };
  return s;
}

describe("EntityNameChangerPane.load", () => {
  it("shows the modules and disables the entity picker", async () => {
    const { view, pane } = setup();
    await pane.load();
    expect(view.modules).toEqual([{ names: ["MyModule", "Other"], selected: undefined }]);
    expect(view.entities).toEqual([{ options: null, selectedId: undefined }]);
  });

  it("shows an error when loading fails", async () => {
    const view = new FakeView();
    const pane = new EntityNameChangerPane(view, { loadData: () => Promise.reject(new Error("no model")), rename: vi.fn(), openDocument: vi.fn() });
    await pane.load();
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not load entities: no model" }]);
    expect(view.modules).toEqual([]);
  });
});

describe("EntityNameChangerPane.selectModule", () => {
  it("shows the module's entities, or disables the picker without a module", async () => {
    const { view, pane } = setup();
    await pane.load();
    pane.selectModule("Other");
    expect(view.entities.at(-1)).toEqual({ options: [option("Invoice", "Other")], selectedId: undefined });
    pane.selectModule("");
    expect(view.entities.at(-1)).toEqual({ options: null, selectedId: undefined });
    pane.selectModule("Gone");
    expect(view.entities.at(-1)?.options).toEqual([]);
  });
});

describe("EntityNameChangerPane.submit", () => {
  it.each([
    [{ moduleName: "", entityId: "", newName: "X" }, "module", "Select a module."],
    [{ moduleName: "MyModule", entityId: "", newName: "X" }, "entity", "Select an entity to rename."],
    [{ moduleName: "MyModule", entityId: "id-Invoice", newName: "X" }, "entity", "Select an entity to rename."],
    [{ moduleName: "MyModule", entityId: "id-Order", newName: "" }, "name", "Enter a new name."],
    [{ moduleName: "MyModule", entityId: "id-Order", newName: "Order" }, "name", "The new name is the same as the current name."],
  ] as const)("marks the field for %j", async (request, field, message) => {
    const { view, pane, rename } = setup();
    await pane.load();
    view.request = { ...request, renameExposedNames: false };
    await pane.submit();
    expect(view.fieldErrors).toEqual([{ field, message }]);
    expect(rename).not.toHaveBeenCalled();
    expect(view.busy).toEqual([]);
  });

  it("runs the rename with the module's scope and shows outcome and run log", async () => {
    const { view, pane, rename, loadData } = await loadedWithRequest("Purchase");
    await pane.submit();
    expect(rename).toHaveBeenCalledWith(
      { entity: option("Order"), newName: "Purchase", renameExposedNames: false },
      { excludedModules: new Set(["System"]), allEntityNames: ["Order", "Customer", "Invoice"], entityNamesInModule: ["Order", "Customer"] },
    );
    expect(view.busy).toEqual([true, false]);
    expect(view.outcome).toEqual([{ tone: "success", text: "MyModule.Order renamed to MyModule.Purchase." }]);
    expect(view.runLog?.log?.groups[0].title).toBe("Entity");
    expect(view.runLog?.meta).toBe("10:00:01 · 1.0 s");
    expect(view.nameCleared).toBe(1);
    expect(loadData).toHaveBeenCalledTimes(2);
  });

  it("passes the exposed names choice on", async () => {
    const { view, pane, rename } = await loadedWithRequest("Purchase");
    view.request = { ...view.request, renameExposedNames: true };
    await pane.submit();
    expect(rename.mock.calls[0][0]).toMatchObject({ newName: "Purchase", renameExposedNames: true });
  });

  it("shows the progress status while the rename runs", async () => {
    let seen: Status[] = [];
    const { view, pane } = await loadedWithRequest("Purchase", async () => {
      seen = [...view.outcome];
      return ran("Success", true);
    });
    await pane.submit();
    expect(seen).toEqual([{ tone: "info", text: "Renaming MyModule.Order to MyModule.Purchase…" }]);
  });

  it("reloads after a rename and clears the module and entity selection", async () => {
    const renamed = data({ MyModule: ["Customer", "Purchase"], Other: ["Invoice"] });
    const { view, pane } = await loadedWithRequest("Purchase", undefined, [data({ MyModule: ["Order", "Customer"], Other: ["Invoice"] }), renamed]);
    await pane.submit();
    expect(view.modules.at(-1)).toEqual({ names: ["MyModule", "Other"], selected: undefined });
    expect(view.entities.at(-1)).toEqual({ options: null, selectedId: undefined });
    pane.selectModule("MyModule");
    expect(view.entities.at(-1)?.options).toEqual(renamed.byModule.get("MyModule"));
  });

  it("clears the selection when the reload fails", async () => {
    const { view, pane, loadData } = await loadedWithRequest("Purchase");
    loadData.mockRejectedValueOnce("offline");
    await pane.submit();
    expect(view.modules.at(-1)).toEqual({ names: ["MyModule", "Other"], selected: undefined });
    expect(view.entities.at(-1)).toEqual({ options: null, selectedId: undefined });
  });

  it("keeps the selection when the entity was not renamed", async () => {
    const { view, pane } = await loadedWithRequest("Purchase", async () => ran("UserCancelled", false));
    const modules = view.modules.length;
    const entities = view.entities.length;
    await pane.submit();
    expect([view.modules.length, view.entities.length]).toEqual([modules, entities]);
  });

  it("does not reload when the entity was not renamed", async () => {
    const { view, pane, loadData } = await loadedWithRequest("Purchase", async () => ran("UserCancelled", false));
    await pane.submit();
    expect(loadData).toHaveBeenCalledTimes(1);
    expect(view.nameCleared).toBe(0);
    expect(view.outcome).toEqual([{ tone: "warning", text: "Rename cancelled; nothing was changed." }]);
  });

  it("shows a rejected name at the name field", async () => {
    const { view, pane } = await loadedWithRequest("Customer", async () => ({ kind: "rejected", message: "An entity named MyModule.Customer already exists." }));
    await pane.submit();
    expect(view.fieldErrors).toEqual([{ field: "name", message: "An entity named MyModule.Customer already exists." }]);
    expect(view.outcome).toEqual([]);
    expect(view.runLog).toBeUndefined();
    expect(view.busy).toEqual([true, false]);
  });

  it("shows an error and ends busy when the rename throws", async () => {
    const { view, pane } = await loadedWithRequest("Purchase", async () => {
      throw new Error("API gone");
    });
    await pane.submit();
    expect(view.outcome).toEqual([{ tone: "error", text: "Rename failed: API gone" }]);
    expect(view.busy).toEqual([true, false]);
  });

  it("reports a failed reload without hiding the rename outcome", async () => {
    const { view, pane, loadData } = await loadedWithRequest("Purchase");
    loadData.mockRejectedValueOnce("offline");
    await pane.submit();
    expect(view.outcome).toEqual([
      { tone: "success", text: "MyModule.Order renamed to MyModule.Purchase." },
      { tone: "error", text: "Could not reload entities: offline" },
    ]);
    expect(view.busy).toEqual([true, false]);
  });

  it("ignores a submit while a rename runs", async () => {
    let finish!: (r: RenameRunResult) => void;
    const { pane, rename } = await loadedWithRequest("Purchase", () => new Promise((resolve) => (finish = resolve)));
    const first = pane.submit();
    await pane.submit();
    expect(rename).toHaveBeenCalledTimes(1);
    finish(ran("Success", false));
    await first;
  });
});

describe("EntityNameChangerPane.clearLog", () => {
  it("clears the outcome and hides the run log", async () => {
    const { view, pane } = await loadedWithRequest("Purchase");
    await pane.submit();
    pane.clearLog();
    expect(view.outcome).toEqual([]);
    expect(view.runLog).toEqual({ log: null, meta: "" });
  });
});

describe("EntityNameChangerPane.openDocument", () => {
  it("passes the row target to Studio Pro", async () => {
    const { view, pane, openDocument } = setup();
    await pane.openDocument({ documentId: "dm-1", elementId: "entity-1" });
    expect(openDocument).toHaveBeenCalledWith({ documentId: "dm-1", elementId: "entity-1" });
    expect(view.outcome).toEqual([]);
  });

  it("shows an error when the document can't be opened", async () => {
    const { view, pane, openDocument } = setup();
    openDocument.mockRejectedValueOnce(new Error("not found"));
    await pane.openDocument({ documentId: "gone" });
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not open the document: not found" }]);
  });
});
