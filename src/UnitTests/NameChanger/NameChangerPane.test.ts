import type { ProgressDialogResult } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import type { Status } from "../../shared/design/status";
import type { EntityOption } from "../../NameChanger/entityPicker";
import { COMMIT_FIRST_WARNING } from "../../shared/design/confirm";
import { confirmQuestion, NameChangerPane, type PaneData, type PaneDeps, type PaneViewPort } from "../../NameChanger/NameChangerPane";
import { RenameReport } from "../../NameChanger/framework/RenameReport";
import type { RenameRunResult } from "../../NameChanger/renameService";
import type { RowTarget, RunLog } from "../../shared/design/runLog";
import type { PaneField } from "../../NameChanger/validation";
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

function setup(
  rename: PaneDeps["rename"] = async () => ran("Success", true),
  loads: PaneData[] = [data({ MyModule: ["Order", "Customer"], Other: ["Invoice"] })],
  confirm: PaneDeps["confirm"] = async () => true,
) {
  const view = new FakeView();
  const loadData = vi.fn(async () => {
    const next = loads.length > 1 ? loads.shift()! : loads[0];
    return next;
  });
  const renameSpy = vi.fn(rename);
  const openDocument = vi.fn(async (_target: RowTarget) => {});
  const confirmSpy = vi.fn(confirm);
  let tick = 0;
  const pane = new NameChangerPane(view, { loadData, rename: renameSpy, openDocument, confirm: confirmSpy, now: () => new Date(2026, 9, 9, 10, 0, tick++) });
  return { view, pane, loadData, rename: renameSpy, openDocument, confirm: confirmSpy };
}

async function loadedWithRequest(newName: string, rename?: PaneDeps["rename"], loads?: PaneData[], confirm?: PaneDeps["confirm"]) {
  const s = setup(rename, loads, confirm);
  await s.pane.load();
  s.pane.selectModule("MyModule");
  s.view.request = { moduleName: "MyModule", entityId: "id-Order", newName, renameExposedNames: false };
  return s;
}

describe("NameChangerPane.load", () => {
  it("shows the modules and disables the entity picker", async () => {
    const { view, pane } = setup();
    await pane.load();
    expect(view.modules).toEqual([{ names: ["MyModule", "Other"], selected: undefined }]);
    expect(view.entities).toEqual([{ options: null, selectedId: undefined }]);
  });

  it("shows an error when loading fails", async () => {
    const view = new FakeView();
    const pane = new NameChangerPane(view, { loadData: () => Promise.reject(new Error("no model")), rename: vi.fn(), openDocument: vi.fn(), confirm: vi.fn() });
    await pane.load();
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not load entities: no model" }]);
    expect(view.modules).toEqual([]);
  });
});

describe("NameChangerPane.selectModule", () => {
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

describe("NameChangerPane.preselectModule", () => {
  it("reloads and selects the module with its entities", async () => {
    const fresh = data({ MyModule: ["Order", "Customer", "Invoice2"], Other: ["Invoice"] });
    const { view, pane, loadData } = setup(undefined, [data({ MyModule: ["Order", "Customer"], Other: ["Invoice"] }), fresh]);
    await pane.load();
    await pane.preselectModule("MyModule");
    expect(loadData).toHaveBeenCalledTimes(2);
    expect(view.modules.at(-1)).toEqual({ names: ["MyModule", "Other"], selected: "MyModule" });
    expect(view.entities.at(-1)).toEqual({ options: fresh.byModule.get("MyModule"), selectedId: undefined });
  });

  it.each([
    ["System", "System is a Marketplace module or System; its entities can't be renamed."],
    ["Empty", "Module Empty has no entities to rename."],
  ])("warns for module %s and clears the selection", async (moduleName, text) => {
    const { view, pane } = setup();
    await pane.load();
    pane.selectModule("MyModule");
    await pane.preselectModule(moduleName);
    expect(view.outcome).toEqual([{ tone: "warning", text }]);
    expect(view.modules.at(-1)).toEqual({ names: ["MyModule", "Other"], selected: undefined });
    expect(view.entities.at(-1)).toEqual({ options: null, selectedId: undefined });
  });

  it("shows an error when the reload fails", async () => {
    const { view, pane, loadData } = setup();
    await pane.load();
    loadData.mockRejectedValueOnce("offline");
    const entities = view.entities.length;
    await pane.preselectModule("MyModule");
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not reload entities: offline" }]);
    expect(view.entities.length).toBe(entities);
  });

  it("is ignored while a rename runs", async () => {
    let finish!: (r: RenameRunResult) => void;
    const { view, pane, loadData, rename } = await loadedWithRequest("Purchase", () => new Promise((resolve) => (finish = resolve)));
    const running = pane.submit();
    await vi.waitFor(() => expect(rename).toHaveBeenCalledOnce());
    const modules = view.modules.length;
    await pane.preselectModule("Other");
    expect(view.modules.length).toBe(modules);
    expect(loadData).toHaveBeenCalledTimes(1);
    finish(ran("UserCancelled", false));
    await running;
  });
});

describe("NameChangerPane.submit", () => {
  it.each([
    [{ moduleName: "", entityId: "", newName: "X" }, "module", "Select a module."],
    [{ moduleName: "MyModule", entityId: "", newName: "X" }, "entity", "Select an entity to rename."],
    [{ moduleName: "MyModule", entityId: "id-Invoice", newName: "X" }, "entity", "Select an entity to rename."],
    [{ moduleName: "MyModule", entityId: "id-Order", newName: "" }, "name", "Enter a new name."],
    [{ moduleName: "MyModule", entityId: "id-Order", newName: "Order" }, "name", "The new name is the same as the current name."],
  ] as const)("marks the field for %j", async (request, field, message) => {
    const { view, pane, rename, confirm } = setup();
    await pane.load();
    view.request = { ...request, renameExposedNames: false };
    await pane.submit();
    expect(view.fieldErrors).toEqual([{ field, message }]);
    expect(confirm).not.toHaveBeenCalled();
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
    expect(loadData).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before the rename", async () => {
    const { pane, rename, confirm } = await loadedWithRequest("Purchase");
    await pane.submit();
    expect(confirm).toHaveBeenCalledWith(confirmQuestion({ entity: option("Order"), newName: "Purchase", renameExposedNames: false }));
    expect(confirm.mock.invocationCallOrder[0]).toBeLessThan(rename.mock.invocationCallOrder[0]);
  });

  it("renames nothing when the confirmation is declined", async () => {
    const { view, pane, rename } = await loadedWithRequest("Purchase", undefined, undefined, async () => false);
    await pane.submit();
    expect(rename).not.toHaveBeenCalled();
    expect(view.outcome).toEqual([]);
    expect(view.runLog).toBeUndefined();
    expect(view.busy).toEqual([true, false]);
  });

  it("reports a failing confirmation and renames nothing", async () => {
    const { view, pane, rename } = await loadedWithRequest("Purchase", undefined, undefined, async () => Promise.reject(new Error("no dialog")));
    await pane.submit();
    expect(view.outcome).toEqual([{ tone: "error", text: "Could not ask for confirmation: no dialog" }]);
    expect(rename).not.toHaveBeenCalled();
    expect(view.busy).toEqual([true, false]);
  });

  it("ignores a submit and a preselect while the confirmation is open", async () => {
    let answer: (yes: boolean) => void = () => undefined;
    const { pane, rename, confirm, loadData } = await loadedWithRequest("Purchase", undefined, undefined, () => new Promise((resolve) => (answer = resolve)));
    const first = pane.submit();
    await pane.submit();
    await pane.preselectModule("Other");
    expect(confirm).toHaveBeenCalledOnce();
    expect(loadData).toHaveBeenCalledOnce();
    answer(true);
    await first;
    expect(rename).toHaveBeenCalledOnce();
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

  it("patches the renamed entity in without reloading and clears the module and entity selection", async () => {
    const { view, pane, loadData } = await loadedWithRequest("Zebra");
    await pane.submit();
    expect(loadData).toHaveBeenCalledTimes(1);
    expect(view.modules.at(-1)).toEqual({ names: ["MyModule", "Other"], selected: undefined });
    expect(view.entities.at(-1)).toEqual({ options: null, selectedId: undefined });
    pane.selectModule("MyModule");
    expect(view.entities.at(-1)?.options).toEqual([option("Customer"), { ...option("Order"), name: "Zebra" }]);
  });

  it("protects the renamed entity's new name in the next rename", async () => {
    const { view, pane, rename } = await loadedWithRequest("Purchase");
    await pane.submit();
    pane.selectModule("MyModule");
    view.request = { moduleName: "MyModule", entityId: "id-Customer", newName: "Client", renameExposedNames: false };
    await pane.submit();
    expect(rename.mock.calls[1][1]).toMatchObject({ allEntityNames: ["Customer", "Purchase", "Invoice"], entityNamesInModule: ["Customer", "Purchase"] });
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

  it("ignores a submit while a rename runs", async () => {
    let finish!: (r: RenameRunResult) => void;
    const { pane, rename } = await loadedWithRequest("Purchase", () => new Promise((resolve) => (finish = resolve)));
    const first = pane.submit();
    await vi.waitFor(() => expect(rename).toHaveBeenCalledOnce());
    await pane.submit();
    expect(rename).toHaveBeenCalledTimes(1);
    finish(ran("Success", false));
    await first;
  });
});

describe("confirmQuestion", () => {
  it("names the rename and ends with the commit warning", () => {
    expect(confirmQuestion({ entity: option("Order"), newName: "Purchase" })).toBe(
      `Rename MyModule.Order to MyModule.Purchase, with what is named after it, and update every reference?\n\n${COMMIT_FIRST_WARNING}`,
    );
  });

  it("warns about the clients of published services when exposed names are renamed", () => {
    expect(confirmQuestion({ entity: option("Order"), newName: "Purchase", renameExposedNames: true })).toBe(
      "Rename MyModule.Order to MyModule.Purchase, with what is named after it, and update every reference?\n\n" +
        `Exposed names in published services are renamed too, so their clients must be updated.\n\n${COMMIT_FIRST_WARNING}`,
    );
  });
});

describe("NameChangerPane.clearLog", () => {
  it("clears the outcome and hides the run log", async () => {
    const { view, pane } = await loadedWithRequest("Purchase");
    await pane.submit();
    pane.clearLog();
    expect(view.outcome).toEqual([]);
    expect(view.runLog).toEqual({ log: null, meta: "" });
  });
});

describe("NameChangerPane.openDocument", () => {
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
