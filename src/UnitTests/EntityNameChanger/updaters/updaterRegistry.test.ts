import { describe, expect, it } from "vitest";
import { DocumentNameRegistry } from "../../../EntityNameChanger/framework/DocumentNameRegistry";
import { fakeContext } from "../helpers/fakes";
import { MicroflowUpdater } from "../../../EntityNameChanger/updaters/microflows/MicroflowUpdater";
import { type AppModel, createUpdaters, EXCLUDED_DOCUMENT_TYPES } from "../../../EntityNameChanger/updaters/updaterRegistry";

// Every model API the registry passes on; each is a distinct marker object.
const API_NAMES = [
  "microflows",
  "nanoflows",
  "rules",
  "pages",
  "snippets",
  "workflows",
  "importMappings",
  "exportMappings",
  "jsonStructures",
  "messageDefinitions",
  "javaActions",
  "javaScriptActions",
  "documentTemplates",
  "dataSets",
  "domainModels",
  "consumedRestServices",
  "mlMappingDocuments",
];
const model = Object.fromEntries(API_NAMES.map((name) => [name, { api: name }])) as unknown as AppModel;

function create(renamePages: boolean) {
  return createUpdaters(model, {
    context: fakeContext(),
    documentNames: new DocumentNameRegistry(),
    options: { renamePages },
  });
}

describe("createUpdaters", () => {
  it("lists every updater in execution order when pages are selected", () => {
    expect(create(true).map((u) => u.label)).toEqual([
      "Microflows",
      "Nanoflows",
      "Rules",
      "Pages",
      "Snippets",
      "Workflows",
      "Import mappings",
      "Export mappings",
      "JSON structures",
      "Message definitions",
      "Java actions",
      "JavaScript actions",
      "Document templates",
      "Datasets",
      "Associations",
    ]);
  });

  it("leaves out pages and snippets when not selected", () => {
    const labels = create(false).map((u) => u.label);
    expect(labels).not.toContain("Pages");
    expect(labels).not.toContain("Snippets");
    expect(labels.at(-1)).toBe("Associations");
  });

  it("only implements microflows, wired to the microflows api", () => {
    const updaters = create(true);
    expect(updaters.filter((u) => u.implemented).map((u) => u.label)).toEqual(["Microflows"]);
    expect(updaters[0]).toBeInstanceOf(MicroflowUpdater);
    expect(updaters[0].access).toBe(model.microflows);
  });

  it("passes the matching model api and unit type to each stub", () => {
    const byLabel = new Map(create(true).map((u) => [u.label, u]));
    expect(byLabel.get("Pages")?.access).toBe(model.pages);
    expect(byLabel.get("Pages")?.unitType).toBe("Pages$Page");
    expect(byLabel.get("Associations")?.access).toBe(model.domainModels);
    expect(byLabel.get("Associations")?.unitType).toBe("DomainModels$DomainModel");
    expect(byLabel.get("Datasets")?.unitType).toBe("DataSets$DataSet");
  });

  it("documents the excluded types with a reason", () => {
    expect(EXCLUDED_DOCUMENT_TYPES.every((e) => e.label.length > 0 && e.reason.length > 0)).toBe(true);
  });
});
