import type * as Mx from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { type ContextMenuDeps, DOMAIN_MODEL_TYPE, registerEntityRenameMenus } from "../../NameChanger/contextMenu";
import { FakeMessaging } from "./helpers/fakeMessaging";

type ActionMenu = { menuId: string; caption: string; action: (context: Mx.DocumentContext) => Promise<void> };

async function setup(modules: Record<string, string> = { "dm-sales": "Sales" }) {
  const messaging = new FakeMessaging();
  const explorer: { menu: ActionMenu; type: string }[] = [];
  const editor: { menu: ActionMenu; type: string }[] = [];
  const deps: ContextMenuDeps = {
    addExplorerMenu: async (menu, type) => void explorer.push({ menu: menu as unknown as ActionMenu, type }),
    addEditorMenu: async (menu, type) => void editor.push({ menu: menu as unknown as ActionMenu, type }),
    moduleOfDomainModel: async (id) => modules[id] ?? null,
    openPane: vi.fn(async () => {}),
    messaging,
  };
  await registerEntityRenameMenus(deps);
  return { messaging, explorer, editor, deps, click: (id: string) => explorer[0].menu.action({ documentId: id }) };
}

const ready = { type: "BGS-UtilityTools.NameChanger.paneReady" };

describe("registerEntityRenameMenus", () => {
  it("adds 'Rename entity…' to domain models in the App Explorer and the editor", async () => {
    const { explorer, editor } = await setup();
    expect(explorer.map((e) => [e.menu.menuId, e.menu.caption, e.type])).toEqual([["BGS-UtilityTools.RenameEntity.Explorer", "Rename entity…", DOMAIN_MODEL_TYPE]]);
    expect(editor.map((e) => [e.menu.menuId, e.menu.caption, e.type])).toEqual([["BGS-UtilityTools.RenameEntity.Editor", "Rename entity…", DOMAIN_MODEL_TYPE]]);
    expect(editor[0].menu.action).toBe(explorer[0].menu.action);
  });

  it("opens the pane and sends the domain model's module", async () => {
    const { messaging, deps, click } = await setup();
    await click("dm-sales");
    expect(deps.openPane).toHaveBeenCalledOnce();
    expect(messaging.sent.map((s) => s.message)).toEqual([{ type: "BGS-UtilityTools.NameChanger.preselectModule", moduleName: "Sales" }]);
  });

  it("hands the module to a pane that loads afterwards, once", async () => {
    const { messaging, click } = await setup();
    await click("dm-sales");
    await messaging.deliver(ready, "r1");
    await messaging.deliver(ready, "r2");
    expect(messaging.responses).toEqual([
      { messageId: "r1", response: { moduleName: "Sales" } },
      { messageId: "r2", response: { moduleName: null } },
    ]);
  });

  it("no longer hands the module over once an open pane applied it", async () => {
    const { messaging, click } = await setup();
    await click("dm-sales");
    await messaging.respond({});
    await messaging.deliver(ready, "r1");
    expect(messaging.responses).toEqual([{ messageId: "r1", response: { moduleName: null } }]);
  });

  it("only opens the pane for an unknown domain model", async () => {
    const { messaging, deps, click } = await setup();
    await click("dm-unknown");
    expect(deps.openPane).toHaveBeenCalledOnce();
    expect(messaging.sent).toEqual([]);
    await messaging.deliver(ready, "r1");
    expect(messaging.responses).toEqual([{ messageId: "r1", response: { moduleName: null } }]);
  });

  it("ignores other messages", async () => {
    const { messaging } = await setup();
    await messaging.deliver({ type: "BGS-UtilityTools.NameChanger.preselectModule", moduleName: "X" });
    expect(messaging.responses).toEqual([]);
  });
});
