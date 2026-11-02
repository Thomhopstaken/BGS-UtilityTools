import type * as Mx from "@mendix/extensions-api";
import { isPaneMessage, type Messaging, type PaneMessage, type ReadyResponse } from "./paneMessages";

export const DOMAIN_MODEL_TYPE = "DomainModels$DomainModel";

export type ContextMenuDeps = {
  // App Explorer and document editor menus.
  addExplorerMenu(menu: Mx.Menu<Mx.DocumentContext>, documentType: string): Promise<void>;
  addEditorMenu(menu: Mx.Menu<Mx.DocumentContext>, documentType: string): Promise<void>;
  // Module of the domain model with this unit $ID, or null.
  moduleOfDomainModel(documentId: string): Promise<string | null>;
  openPane(): Promise<void>;
  messaging: Messaging;
};

// "Rename entity…" on domain models: opens the pane with the domain model's module selected. The API passes only the
// document, not the clicked entity, so the entity is picked in the pane.
// UNVERIFIED: the menu's documentId is the domain model's unit $ID; the menus show for "DomainModels$DomainModel".
export async function registerEntityRenameMenus(deps: ContextMenuDeps): Promise<void> {
  // Set by a menu click, handed to a pane that loads afterwards; cleared once a pane applied it.
  let pending: string | null = null;

  await deps.messaging.addMessageHandler<unknown>(async (info) => {
    if (isPaneMessage(info.message) && info.message.type === "BGS-UtilityTools.ENC.paneReady") {
      console.info(`context menu: pane ready, handing over module '${pending}'`);
      const response: ReadyResponse = { moduleName: pending };
      pending = null;
      await deps.messaging.sendResponse(info.messageId, response);
    }
  });

  const action = async (context: Mx.DocumentContext): Promise<void> => {
    const moduleName = await deps.moduleOfDomainModel(context.documentId);
    console.info(`context menu: rename entity in domain model ${context.documentId}, module '${moduleName}'`);
    pending = moduleName;
    await deps.openPane();
    if (moduleName === null) {
      return;
    }
    const message: PaneMessage = { type: "BGS-UtilityTools.ENC.preselectModule", moduleName };
    // An open pane applies it right away; a pane still loading asks for `pending` instead.
    await deps.messaging.sendMessage(message, async () => {
      console.debug(`context menu: pane applied module '${moduleName}'`);
      pending = null;
    });
  };

  const menu = (menuId: string): Mx.Menu<Mx.DocumentContext> => ({ menuId, caption: "Rename entity…", action });
  await deps.addExplorerMenu(menu("BGS-UtilityTools.RenameEntity.Explorer"), DOMAIN_MODEL_TYPE);
  await deps.addEditorMenu(menu("BGS-UtilityTools.RenameEntity.Editor"), DOMAIN_MODEL_TYPE);
  console.info("context menu: 'Rename entity…' added to domain models");
}
