import { describe, expect, it } from "vitest";
import { DocumentNameRegistry } from "../../../EntityNameChanger/framework/DocumentNameRegistry";

describe("DocumentNameRegistry", () => {
  it("collects documents from nested folders per module", () => {
    const registry = DocumentNameRegistry.fromModulesTree([
      {
        name: "MyModule",
        documents: [{ name: "ACT_Order" }],
        folders: [{ documents: [{ name: "SUB_Order" }], folders: [{ documents: [{ name: "Deep" }] }] }],
      },
      { name: "Other", documents: [{ name: "ACT_Order" }] },
    ]);
    expect(registry.size).toBe(4);
    expect(registry.isFree("MyModule", "Deep")).toBe(false);
    expect(registry.isFree("Other", "SUB_Order")).toBe(true);
  });

  it("skips unnamed modules and documents", () => {
    const registry = DocumentNameRegistry.fromModulesTree([
      { documents: [{ name: "Lost" }] },
      { name: "MyModule", documents: [{}, { name: "Kept" }] },
    ]);
    expect(registry.size).toBe(1);
    expect(registry.isFree("MyModule", "Kept")).toBe(false);
  });

  it("treats unknown modules as free", () => {
    expect(new DocumentNameRegistry().isFree("Nope", "Anything")).toBe(true);
  });

  it("register frees the old name and takes the new one", () => {
    const registry = new DocumentNameRegistry();
    registry.add("MyModule", "ACT_Order");
    registry.register("MyModule", "ACT_Order", "ACT_Purchase");
    expect(registry.isFree("MyModule", "ACT_Order")).toBe(true);
    expect(registry.isFree("MyModule", "ACT_Purchase")).toBe(false);
    expect(registry.size).toBe(1);
  });

  it("register works for a module not seen before", () => {
    const registry = new DocumentNameRegistry();
    registry.register("New", "A", "B");
    expect(registry.isFree("New", "B")).toBe(false);
  });
});
