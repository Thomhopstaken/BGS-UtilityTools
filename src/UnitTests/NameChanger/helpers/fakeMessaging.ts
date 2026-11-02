import type * as Mx from "@mendix/extensions-api";
import type { Messaging } from "../../../NameChanger/paneMessages";

// One side of Studio Pro's message passing: records what is sent, lets a test deliver messages and responses.
export class FakeMessaging implements Messaging {
  readonly sent: { message: unknown; onResponse?: (response: unknown) => Promise<void> }[] = [];
  readonly responses: { messageId: string; response: unknown }[] = [];
  private handler: Mx.MessageHandler<unknown> | null = null;

  async sendMessage<TMessageData, TResponseData>(message: TMessageData, onResponse?: Mx.ResponseHandler<TResponseData>): Promise<void> {
    this.sent.push({ message, onResponse: onResponse as ((response: unknown) => Promise<void>) | undefined });
  }

  async addMessageHandler<TMessageData>(onMessage: Mx.MessageHandler<TMessageData>): Promise<Mx.HandlerReference> {
    this.handler = onMessage as Mx.MessageHandler<unknown>;
    return { handlerId: "h1" };
  }

  async sendResponse<TResponseData>(messageId: string, response: TResponseData): Promise<boolean> {
    this.responses.push({ messageId, response });
    return true;
  }

  async deliver(message: unknown, messageId = "m1"): Promise<void> {
    await this.handler?.({ messageId, message });
  }

  // Answers the last sent message, as the other side would.
  async respond(response: unknown): Promise<void> {
    await this.sent.at(-1)?.onResponse?.(response);
  }
}
