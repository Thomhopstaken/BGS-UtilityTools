import { describe, expect, it, vi } from "vitest";
import { type DocumentEditors, openTarget } from "../../ClassSearcher/openTarget";

function editors(overrides: Partial<DocumentEditors> = {}) {
  return {
    openDocument: vi.fn(async () => undefined),
    focusElement: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("openTarget", () => {
  it("opens a document row's document", async () => {
    const fake = editors();
    await openTarget(fake, { documentId: "p1" });
    expect(fake.openDocument).toHaveBeenCalledWith("p1");
    expect(fake.focusElement).not.toHaveBeenCalled();
  });

  it("focuses an element row's element", async () => {
    const fake = editors();
    await openTarget(fake, { documentId: "p1", elementId: "w1" });
    expect(fake.focusElement).toHaveBeenCalledWith("p1", "w1");
    expect(fake.openDocument).not.toHaveBeenCalled();
  });

  it("opens only the document when focusing fails", async () => {
    const fake = editors({ focusElement: vi.fn(async () => Promise.reject(new Error("not an element"))) });
    await openTarget(fake, { documentId: "p1", elementId: "w1" });
    expect(fake.openDocument).toHaveBeenCalledWith("p1");
  });

  it("fails when the document can't be opened", async () => {
    const fake = editors({ openDocument: vi.fn(async () => Promise.reject(new Error("gone"))) });
    await expect(openTarget(fake, { documentId: "p1" })).rejects.toThrow("gone");
  });
});
