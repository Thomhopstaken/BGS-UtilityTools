import { describe, expect, it, vi } from "vitest";
import { connectPane, isPaneMessage } from "../../EntityNameChanger/paneMessages";
import { FakeMessaging } from "./helpers/fakeMessaging";

describe("isPaneMessage", () => {
  it("accepts only the pane message types", () => {
    expect(isPaneMessage({ type: "BGS-UtilityTools.ENC.paneReady" })).toBe(true);
    expect(isPaneMessage({ type: "BGS-UtilityTools.ENC.preselectModule", moduleName: "M" })).toBe(true);
    expect(isPaneMessage({ type: "other" })).toBe(false);
    expect(isPaneMessage(null)).toBe(false);
    expect(isPaneMessage("x")).toBe(false);
  });
});

describe("connectPane", () => {
  it("asks for a waiting module once connected and applies it", async () => {
    const messaging = new FakeMessaging();
    const preselect = vi.fn(async (_moduleName: string) => {});
    await connectPane(messaging, preselect);
    expect(messaging.sent.map((s) => s.message)).toEqual([{ type: "BGS-UtilityTools.ENC.paneReady" }]);
    await messaging.respond({ moduleName: "Sales" });
    expect(preselect).toHaveBeenCalledWith("Sales");
  });

  it("does nothing when no module is waiting", async () => {
    const messaging = new FakeMessaging();
    const preselect = vi.fn(async (_moduleName: string) => {});
    await connectPane(messaging, preselect);
    await messaging.respond({ moduleName: null });
    expect(preselect).not.toHaveBeenCalled();
  });

  it("applies a preselect sent while open and confirms it", async () => {
    const messaging = new FakeMessaging();
    const preselect = vi.fn(async (_moduleName: string) => {});
    await connectPane(messaging, preselect);
    await messaging.deliver({ type: "BGS-UtilityTools.ENC.preselectModule", moduleName: "Sales" }, "m7");
    expect(preselect).toHaveBeenCalledWith("Sales");
    expect(messaging.responses).toEqual([{ messageId: "m7", response: {} }]);
  });

  it("ignores other messages", async () => {
    const messaging = new FakeMessaging();
    const preselect = vi.fn(async (_moduleName: string) => {});
    await connectPane(messaging, preselect);
    await messaging.deliver({ type: "BGS-UtilityTools.ENC.paneReady" });
    await messaging.deliver({ type: "something else" });
    expect(preselect).not.toHaveBeenCalled();
    expect(messaging.responses).toEqual([]);
  });
});
