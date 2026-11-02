import { describe, expect, it, vi } from "vitest";
import { DocumentNameRegistry } from "../../../EntityNameChanger/framework/DocumentNameRegistry";
import { PrepareStep } from "../../../EntityNameChanger/framework/PrepareStep";
import { RenameReport } from "../../../EntityNameChanger/framework/RenameReport";

function setup(problem: string | null = null, countDocumentTemplates: () => Promise<number> = async () => 2) {
  const documentNames = new DocumentNameRegistry();
  const getModulesTree = vi.fn(async () => [{ name: "MyModule", documents: [{ name: "ACT_Order" }] }]);
  const count = vi.fn(countDocumentTemplates);
  const step = new PrepareStep({ validate: async () => problem, getModulesTree, countDocumentTemplates: count, documentNames });
  return { documentNames, getModulesTree, countDocumentTemplates: count, step };
}

describe("PrepareStep", () => {
  it("is titled Preparing", () => {
    expect(setup().step.title).toBe("Preparing");
  });

  it("validates and fills the document names", async () => {
    const { documentNames, step } = setup();
    const report = new RenameReport();
    expect(await step.run(report)).toBe(true);
    expect(documentNames.isFree("MyModule", "ACT_Order")).toBe(false);
    expect(documentNames.existedAtStart("MyModule", "ACT_Order")).toBe(true);
    expect(report.entitySkipReason).toBeNull();
  });

  it("stops with the problem and loads nothing when validation fails", async () => {
    const { documentNames, getModulesTree, countDocumentTemplates, step } = setup("An entity named MyModule.Purchase already exists.");
    const report = new RenameReport();
    expect(await step.run(report)).toBe("An entity named MyModule.Purchase already exists.");
    expect(report.entitySkipReason).toBe("An entity named MyModule.Purchase already exists.");
    expect(getModulesTree).not.toHaveBeenCalled();
    expect(countDocumentTemplates).not.toHaveBeenCalled();
    expect(documentNames.size).toBe(0);
  });

  it("counts the document templates for the run log", async () => {
    const report = new RenameReport();
    expect(await setup().step.run(report)).toBe(true);
    expect(report.documentTemplates).toBe(2);
  });

  it("does not stop when the document templates can't be listed", async () => {
    const report = new RenameReport();
    expect(await setup(null, () => Promise.reject(new Error("no api"))).step.run(report)).toBe(true);
    expect(report.documentTemplates).toBeNull();
  });
});
