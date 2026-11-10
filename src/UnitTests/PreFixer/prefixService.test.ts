import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { jobTitle, runPrefixRename } from "../../PreFixer/prefixService";
import { RenamedDocumentNames } from "../../shared/rename/RenamedDocumentNames";
import { fakeProgressRunner, fakeUnit, fakeUnitAccess } from "../shared/helpers/fakes";
import { fakeAppModel, infosOf, MF, PAGE, treeDocument, treeModule } from "./helpers/fakeModel";

type Flow = Primitives.UnitBase & { name: string; objectCollection: { objects: { microflow: string }[] } };
type Page = Primitives.UnitBase & { name: string; widgets: { microflow: string }[] };

const flow = (id: string, name: string, calls: string[] = []) =>
  fakeUnit<Flow>(id, { $Type: MF, name, objectCollection: { $Type: "Microflows$MicroflowObjectCollection", objects: calls.map((microflow) => ({ $Type: "Call", microflow })) } });
const page = (id: string, name: string, calls: string[]) => fakeUnit<Page>(id, { $Type: PAGE, name, widgets: calls.map((microflow) => ({ $Type: "W", microflow })) });

// M: two microflows to rename (one used by a Marketplace page), one whose new name is taken, and a page calling one.
function app() {
  const tree = [
    treeModule("M", [
      treeDocument("mf-1", MF, "ACT_Order_Save"),
      treeDocument("mf-2", MF, "ACT_Order_Check"),
      treeDocument("mf-3", MF, "ACT_Order_Taken"),
      treeDocument("mf-4", MF, "SUB_Order_Taken"),
      treeDocument("pg-1", PAGE, "POP_Order_Edit"),
      treeDocument("dm-1", "DomainModels$DomainModel", "DomainModel"),
    ]),
    treeModule("Atlas_Core", [treeDocument("pg-9", PAGE, "Atlas_Page")], [], true),
    treeModule("System", [], [], true),
  ];
  const flows = [flow("mf-1", "ACT_Order_Save", ["M.ACT_Order_Check"]), flow("mf-2", "ACT_Order_Check"), flow("mf-3", "ACT_Order_Taken"), flow("mf-4", "SUB_Order_Taken")];
  const pages = [page("pg-1", "POP_Order_Edit", ["M.ACT_Order_Save", "M.ACT_Order_Check"]), page("pg-9", "Atlas_Page", ["M.ACT_Order_Check"])];
  const microflows = fakeUnitAccess<Primitives.UnitBase>(flows, infosOf(tree, MF));
  const pagesAccess = fakeUnitAccess<Primitives.UnitBase>(pages, infosOf(tree, PAGE));
  const domainModels = fakeUnitAccess<Primitives.UnitBase>(
    [fakeUnit("dm-1", { $Type: "DomainModels$DomainModel", entities: [{ name: "Order" }], associations: [], crossAssociations: [] })],
    infosOf(tree, "DomainModels$DomainModel"),
  );
  const fake = fakeAppModel(tree, { microflows, pages: pagesAccess, domainModels });
  return { fake, flows, pages, microflows, pagesAccess };
}

const deps = (fake: ReturnType<typeof app>["fake"], runProgress = fakeProgressRunner().run, renamedNames = new RenamedDocumentNames()) => ({
  model: fake.model,
  runProgress,
  excludedModules: new Set(["System", "Atlas_Core"]),
  renamedNames,
});

const change = { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" };

describe("runPrefixRename", () => {
  it("renames the prefix, skips what can't be renamed, and rewrites references", async () => {
    const { fake, flows, pages, microflows, pagesAccess } = app();
    const runner = fakeProgressRunner();
    const { dialog, report, plan } = await runPrefixRename(deps(fake, runner.run), change);
    expect(dialog.result).toBe("Success");
    expect(runner.titles).toEqual(["Renaming prefix ACT_ to SUB_ (Microflows & nanoflows)"]);
    expect(plan.all().map((p) => p.newName)).toEqual(["SUB_Order_Save"]);
    expect(flows.map((f) => f.name)).toEqual(["SUB_Order_Save", "ACT_Order_Check", "ACT_Order_Taken", "SUB_Order_Taken"]);
    // The Marketplace page keeps working: ACT_Order_Check keeps its name everywhere.
    expect(flows[0].objectCollection.objects[0].microflow).toBe("M.ACT_Order_Check");
    expect(pages[0].widgets.map((w) => w.microflow)).toEqual(["M.SUB_Order_Save", "M.ACT_Order_Check"]);
    expect(pages[1].widgets.map((w) => w.microflow)).toEqual(["M.ACT_Order_Check"]);
    expect(microflows.saved).toEqual([flows[0]]);
    expect(pagesAccess.saved).toEqual([pages[0]]);
    expect(report.skippedDocuments.map((d) => [d.qualifiedName, d.reason])).toEqual([
      ["M.ACT_Order_Check", "used by Atlas_Core.Atlas_Page in a Marketplace module, which is never changed"],
      ["M.ACT_Order_Taken", "M.SUB_Order_Taken already exists"],
    ]);
    expect(report.renamedDocuments.map((d) => d.newQualifiedName)).toEqual(["M.SUB_Order_Save"]);
    expect(report.hasErrors).toBe(false);
    expect(fake.treeCalls).toBe(1);
  });

  it("plans a second run from the first run's names, though the modules tree still shows the old ones", async () => {
    const { fake, flows } = app();
    const renamedNames = new RenamedDocumentNames();
    await runPrefixRename(deps(fake, undefined, renamedNames), change);
    expect(renamedNames.size).toBe(1);
    // The fake tree is never updated, like Studio Pro's: mf-1 is still ACT_Order_Save there.
    const { plan, report } = await runPrefixRename(deps(fake, undefined, renamedNames), { group: "flows", oldPrefix: "SUB", newPrefix: "XYZ" });
    expect(plan.all().map((p) => [p.document.$ID, p.newName])).toEqual([
      ["mf-1", "XYZ_Order_Save"],
      ["mf-4", "XYZ_Order_Taken"],
    ]);
    expect(report.failures).toEqual([]);
    expect(flows.map((f) => f.name)).toEqual(["XYZ_Order_Save", "ACT_Order_Check", "ACT_Order_Taken", "XYZ_Order_Taken"]);
  });

  it("records the saved renames when the job throws", async () => {
    const { fake } = app();
    const renamedNames = new RenamedDocumentNames();
    const runProgress = async (_: string, steps: ProgressDialogStep[]) => {
      // Up to and including "Renaming microflows".
      for (const step of steps.slice(0, 5)) {
        await step.action();
      }
      throw new Error("dialog gone");
    };
    await expect(runPrefixRename(deps(fake, runProgress, renamedNames), change)).rejects.toThrow("dialog gone");
    expect(renamedNames.size).toBe(1);
  });

  it("shows the steps of the chosen group only, in job order", async () => {
    const { fake } = app();
    const runner = fakeProgressRunner();
    await runPrefixRename(deps(fake, runner.run), change);
    const titles = runner.steps.map((s) => s.title);
    expect(titles.slice(0, 6)).toEqual([
      "Preparing",
      "Checking Marketplace modules",
      "Planning renames",
      "Renaming nanoflows",
      "Renaming microflows",
      "Checking renames",
    ]);
    expect(titles[6]).toBe("Updating references in enumerations");
    expect(titles).not.toContain("Renaming pages");
    expect(runner.steps[4].description).toBe("Renaming microflows (ACT_ -> SUB_)");
  });

  it("never writes the Marketplace or excluded modules", async () => {
    const { fake, pagesAccess } = app();
    await runPrefixRename(deps(fake), change);
    expect(pagesAccess.saved.map((p) => p.$ID)).not.toContain("pg-9");
  });

  it("keeps references to a document whose save failed", async () => {
    const { fake, pages, microflows } = app();
    microflows.save = async () => {
      throw new Error("locked");
    };
    const { report } = await runPrefixRename(deps(fake), change);
    expect(report.failures.map((f) => [f.name, f.error])).toEqual([["M.ACT_Order_Save", "locked"]]);
    expect(pages[0].widgets[0].microflow).toBe("M.ACT_Order_Save");
    expect(report.renamedDocuments).toEqual([]);
  });

  it("removes a prefix", async () => {
    const { fake, flows } = app();
    await runPrefixRename(deps(fake), { ...change, newPrefix: null });
    expect(flows.map((f) => f.name)).toEqual(["Order_Save", "ACT_Order_Check", "Order_Taken", "SUB_Order_Taken"]);
  });

  it("changes nothing when cancelled before the steps", async () => {
    const { fake, flows } = app();
    const { report } = await runPrefixRename(deps(fake, fakeProgressRunner({ result: "UserCancelled" } as ProgressDialogResult).run), change);
    expect(flows[0].name).toBe("ACT_Order_Save");
    expect(report.incompleteReason).toBeNull();
  });

  it("marks the run incomplete when it stops after renames", async () => {
    const { fake } = app();
    // Runs every step, then reports a cancel, as if the last step was cancelled.
    const runProgress = async (_: string, steps: ProgressDialogStep[]) => {
      for (const step of steps) {
        await step.action();
      }
      return { result: "UserCancelled" } as ProgressDialogResult;
    };
    const { report } = await runPrefixRename(deps(fake, runProgress), change);
    expect(report.incompleteReason).toMatch(/^cancelled by user; renamed documents keep their new names/);
  });
});

describe("jobTitle", () => {
  it("names the change and the type group", () => {
    expect(jobTitle(change)).toBe("Renaming prefix ACT_ to SUB_ (Microflows & nanoflows)");
    expect(jobTitle({ group: "pages", oldPrefix: "POP", newPrefix: null })).toBe("Removing prefix POP_ (Pages)");
  });
});
