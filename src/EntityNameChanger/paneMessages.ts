import type * as Mx from "@mendix/extensions-api";

// Messages between the main entry point (context menus) and the pane.
export type PaneMessage =
  // main -> pane: select this module. The pane answers with an empty response once applied.
  | { type: "BGS-UtilityTools.ENC.preselectModule"; moduleName: string }
  // pane -> main, once loaded: is a module waiting? Answered with ReadyResponse.
  | { type: "BGS-UtilityTools.ENC.paneReady" };

export type ReadyResponse = { moduleName: string | null };

export type Messaging = Pick<Mx.IMessagePassingApi, "sendMessage" | "addMessageHandler" | "sendResponse">;

export function isPaneMessage(value: unknown): value is PaneMessage {
  const type = (value as { type?: unknown } | null)?.type;
  return type === "BGS-UtilityTools.ENC.preselectModule" || type === "BGS-UtilityTools.ENC.paneReady";
}

// Pane side: applies preselects sent while the pane is open, then asks main for one sent before it was loaded.
// UNVERIFIED: a closed pane's entry point is not loaded, so a message sent while it opens can be missed; hence the ask.
export async function connectPane(messaging: Messaging, preselect: (moduleName: string) => Promise<void>): Promise<void> {
  await messaging.addMessageHandler<unknown>(async (info) => {
    const message = info.message;
    if (!isPaneMessage(message) || message.type !== "BGS-UtilityTools.ENC.preselectModule") {
      return;
    }
    console.info(`pane: preselect '${message.moduleName}' received`);
    await preselect(message.moduleName);
    await messaging.sendResponse(info.messageId, {});
  });
  const ready: PaneMessage = { type: "BGS-UtilityTools.ENC.paneReady" };
  await messaging.sendMessage<PaneMessage, ReadyResponse>(ready, async (response) => {
    console.debug(`pane: waiting module '${response.moduleName}'`);
    if (response.moduleName !== null) {
      await preselect(response.moduleName);
    }
  });
  console.debug("pane: message handler registered, ready sent");
}
