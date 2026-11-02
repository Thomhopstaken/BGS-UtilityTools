import type { Pages, Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { DocumentNameRegistry } from "../../../../EntityNameChanger/framework/DocumentNameRegistry";
import { DocumentRenamePlan } from "../../../../EntityNameChanger/framework/DocumentRenamePlan";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import type { UpdaterMode } from "../../../../EntityNameChanger/framework/types";
import { PageHelper } from "../../../../EntityNameChanger/updaters/pages/PageHelper";
import { PageUpdater, type PageUpdaterDeps } from "../../../../EntityNameChanger/updaters/pages/PageUpdater";
import { rewriteQualifiedNamesInUnit } from "../../../../EntityNameChanger/updaters/shared/qualifiedNameRewrite";
import { fakeContext, fakeUnitAccess, fakeUnitInfo } from "../../helpers/fakes";
import { objectType, stringType } from "../../helpers/microflowBuilders";
import { element, page, pageParameter, pageVariable, snippet, snippetParameter, widget } from "../../helpers/pageBuilders";

const context = fakeContext();
const QNAME = "MyModule.Order";

function setup<T extends Pages.Page | Pages.Snippet>(unitType: "Pages$Page" | "Pages$Snippet", documents: string[] = []) {
  const documentNames = new DocumentNameRegistry();
  documents.forEach((name) => documentNames.add("MyModule", name));
  const deps: PageUpdaterDeps = {
    helper: new PageHelper(context, new NamingPolicy(context.oldName, context.newName, [])),
    documentNames,
    renames: QualifiedNameRenames.forEntity(context),
    plan: new DocumentRenamePlan(),
  };
  const access = fakeUnitAccess<T>([]);
  const create = (mode: UpdaterMode) =>
    new PageUpdater<T>(
      { label: "Pages", unitType, kind: unitType === "Pages$Page" ? "page" : "snippet", description: "Testing", mode },
      access,
      deps,
    );
  const planner = create("plan");
  const renamer = create("rename");
  // Plans, then renames, like the job does.
  const run = async (doc: T, info: Readonly<Primitives.UnitInfo>) => {
    expect(await planner.update(doc, info)).toMatchObject({ changed: false });
    return renamer.update(doc, info);
  };
  return { planner, renamer, run, access, deps };
}

const info = (name: string, type = "Pages$Page") => fakeUnitInfo("doc-1", type, "MyModule", name);

describe("PageUpdater plan", () => {
  it("has the spec metadata and access", () => {
    const { planner, access } = setup("Pages$Page");
    expect(planner).toMatchObject({ label: "Pages", unitType: "Pages$Page", implemented: true, description: "Testing" });
    expect(planner.access).toBe(access);
  });

  it("lets the rename phase load only documents with planned work", async () => {
    const { planner, renamer } = setup("Pages$Page", ["Order_Edit"]);
    const docs: [string, Pages.Page][] = [
      ["unrelated", page({ name: "Customer_Edit", parameters: [pageParameter("Customer", stringType())] })],
      ["parameter", page({ name: "Home", parameters: [pageParameter("Order", objectType(QNAME))] })],
      ["clash", page({ name: "Overview", parameters: [pageParameter("Order", objectType(QNAME)), pageParameter("Purchase", stringType())] })],
      ["document", page({ name: "Order_Edit", parameters: [pageParameter("Customer", objectType(QNAME))] })],
    ];
    for (const [id, doc] of docs) {
      await planner.update(doc, fakeUnitInfo(id, "Pages$Page", "MyModule", doc.name));
    }
    expect(docs.map(([id]) => renamer.accepts(fakeUnitInfo(id, "Pages$Page")))).toEqual([false, true, true, true]);
    expect(planner.accepts(fakeUnitInfo("unrelated", "Pages$Page"))).toBe(true);
  });

  it("changes nothing in the unit and reports it unchanged", async () => {
    const { planner } = setup("Pages$Page", ["Order_Edit"]);
    const doc = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME))] });
    const before = JSON.stringify(doc);
    expect(await planner.update(doc, info(doc.name))).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("records the page and parameter renames and reserves the new name", async () => {
    const { planner, deps } = setup("Pages$Page", ["Order_Edit"]);
    const doc = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME))] });
    await planner.update(doc, info(doc.name));
    expect([...deps.renames.map]).toEqual([
      [QNAME, "MyModule.Purchase"],
      ["MyModule.Order_Edit", "MyModule.Purchase_Edit"],
      ["MyModule.Order_Edit.Order", "MyModule.Purchase_Edit.Purchase"],
    ]);
    expect(deps.plan.get("doc-1")).toEqual({ renamedTo: "Purchase_Edit", skipped: 0 });
    expect(deps.documentNames.isFree("MyModule", "Purchase_Edit")).toBe(false);
    // Declared by the page: they exist once it was saved.
    expect([...deps.renames.existing((id) => id === "doc-1").keys()]).toEqual(["MyModule.Order_Edit", "MyModule.Order_Edit.Order"]);
  });

  it("records parameter renames of a snippet that keeps its name", async () => {
    const { planner, deps } = setup<Pages.Snippet>("Pages$Snippet");
    const doc = snippet({ name: "Customer_Details", parameters: [snippetParameter("Order", objectType(QNAME))] });
    await planner.update(doc, info(doc.name, "Pages$Snippet"));
    expect(deps.renames.map.get("MyModule.Customer_Details.Order")).toBe("MyModule.Customer_Details.Purchase");
  });

  it("records nothing for a unit without a module", async () => {
    const { planner, deps } = setup("Pages$Page", ["Order_Edit"]);
    const doc = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME))] });
    await planner.update(doc, { $ID: "doc-1", $Type: "Pages$Page", name: "Order_Edit" } as never);
    expect(deps.renames.size).toBe(1);
  });
});

describe("PageUpdater rename", () => {
  it("reports an unrelated page as unchanged", async () => {
    const { run } = setup("Pages$Page");
    const doc = page({ name: "Customer_Edit", parameters: [pageParameter("Customer", stringType())] });
    expect(await run(doc, info(doc.name))).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
  });

  it("renames parameters, usages and the page, and leaves entity references to the reference pass", async () => {
    const { run } = setup("Pages$Page", ["Order_Edit"]);
    const template = element("Pages$ClientTemplateParameter", { expression: "$Order/Name" });
    const doc = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME))], widgets: [widget("Pages$Text", "t", { template })] });
    const result = await run(doc, info(doc.name));
    expect(result).toEqual({ changed: true, renamedTo: "Purchase_Edit", renamedVariables: 1, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
    expect(doc.parameters[0].name).toBe("Purchase");
    expect(doc.parameters[0].parameterType).toMatchObject({ entity: QNAME });
    expect(template.expression).toBe("$Purchase/Name");
    expect(doc.name).toBe("Purchase_Edit");
  });

  it("renames a qualified reference to its own parameter; the reference pass completes the document name", async () => {
    const { run, deps } = setup("Pages$Page", ["Order_Edit"]);
    const variable = pageVariable({ pageParameter: "MyModule.Order_Edit.Order" });
    const doc = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME))], widgets: [variable] });
    await run(doc, info(doc.name));
    expect(variable.pageParameter).toBe("MyModule.Order_Edit.Purchase");
    rewriteQualifiedNamesInUnit(doc, deps.renames.map);
    expect(variable.pageParameter).toBe("MyModule.Purchase_Edit.Purchase");
  });

  it("renames a page that only uses the entity in a data source", async () => {
    const { run } = setup("Pages$Page");
    const entityRef = element("DomainModels$DirectEntityRef", { entity: QNAME });
    const doc = page({ name: "Order_Overview", widgets: [widget("Pages$DataGrid", "grid", { dataSource: element("Pages$GridXPathSource", { entityRef }) })] });
    const result = await run(doc, info(doc.name));
    expect(result).toEqual({ changed: true, renamedTo: "Purchase_Overview", renamedVariables: 0, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
    expect(entityRef.entity).toBe(QNAME);
  });

  it("leaves references to renamed microflows and pages to the reference pass", async () => {
    const { run, deps } = setup("Pages$Page");
    deps.renames.addDocument("MyModule", "ACT_Order_New", "ACT_Purchase_New");
    const settings = element("Pages$MicroflowSettings", { microflow: "MyModule.ACT_Order_New" });
    const doc = page({ name: "Customer_Edit", widgets: [settings] });
    expect(await run(doc, info(doc.name))).toMatchObject({ changed: false });
    expect(settings.microflow).toBe("MyModule.ACT_Order_New");
  });

  it("does not rename a page named after the entity that does not use it", async () => {
    const { run } = setup("Pages$Page");
    const doc = page({ name: "Order_Help" });
    expect((await run(doc, info(doc.name))).renamedTo).toBeNull();
    expect(doc.name).toBe("Order_Help");
  });

  it("does not rename a document without a plan", async () => {
    const { renamer } = setup("Pages$Page", ["Order_Edit"]);
    const doc = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME))] });
    expect((await renamer.update(doc, info(doc.name))).renamedTo).toBeNull();
    expect(doc.name).toBe("Order_Edit");
  });

  it("counts a taken document name and a parameter clash as skipped", async () => {
    const { run } = setup("Pages$Page", ["Order_Edit", "Purchase_Edit"]);
    const doc = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME)), pageParameter("Purchase", stringType())] });
    const result = await run(doc, info(doc.name));
    expect(result).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, updatedReferences: 0, skippedRenames: 2, renamedAssociations: 0 });
    expect(doc.name).toBe("Order_Edit");
  });

  it("handles snippets", async () => {
    const { run } = setup<Pages.Snippet>("Pages$Snippet");
    const doc = snippet({ name: "Order_Details", parameters: [snippetParameter("Order", objectType(QNAME))] });
    const result = await run(doc, info(doc.name, "Pages$Snippet"));
    expect(result).toMatchObject({ changed: true, renamedTo: "Purchase_Details", renamedVariables: 1 });
    expect(doc.parameters[0].name).toBe("Purchase");
  });

  it("resets state between documents", async () => {
    const { run } = setup("Pages$Page");
    const first = page({ name: "A", parameters: [pageParameter("Order", objectType(QNAME))] });
    await run(first, info(first.name));
    const second = page({ name: "B" });
    expect((await run(second, fakeUnitInfo("doc-2", "Pages$Page", "MyModule", "B"))).changed).toBe(false);
  });
});
