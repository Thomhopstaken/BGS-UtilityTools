import { describe, expect, it } from "vitest";
import { DocumentNameRegistry } from "../../../../EntityNameChanger/framework/DocumentNameRegistry";
import { DocumentRenamePlan } from "../../../../EntityNameChanger/framework/DocumentRenamePlan";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import { reconcileSharedName, type SharedNameInput } from "../../../../EntityNameChanger/updaters/domainModels/sharedNames";

const NAME = "Order_Customer";
const TARGET = "Purchase_Customer";
const QNAME = `MyModule.${NAME}`;

// A page MyModule.Order_Customer next to an association with the same name.
function setup(options: { documentTarget?: string | null; planned?: boolean; taken?: string[] } = {}) {
  const documentNames = new DocumentNameRegistry();
  documentNames.add("MyModule", NAME);
  for (const name of options.taken ?? []) {
    documentNames.add("MyModule", name);
  }
  const documentPlan = new DocumentRenamePlan();
  const renames = new QualifiedNameRenames();
  const documentTarget = options.documentTarget ?? null;
  if (options.planned ?? true) {
    documentPlan.set("p1", { renamedTo: documentTarget, skipped: 0 }, QNAME);
    if (documentTarget !== null) {
      documentNames.register("MyModule", NAME, documentTarget);
      renames.addDocument("MyModule", NAME, documentTarget);
    }
    renames.addParameter("MyModule", NAME, documentTarget ?? NAME, "OrderList", "PurchaseList");
  }
  return { documentNames, documentPlan, renames };
}

function input(
  state: ReturnType<typeof setup>,
  associationTarget: string | null,
  associationNameFree: (name: string) => boolean = () => true,
): SharedNameInput {
  return { moduleName: "MyModule", name: NAME, associationTarget, associationNameFree, ...state };
}

describe("reconcileSharedName", () => {
  it("does nothing when neither is renamed", () => {
    const state = setup();
    expect(reconcileSharedName(input(state, null))).toEqual({ associationTarget: null, skipped: 0 });
    expect(state.documentPlan.get("p1").renamedTo).toBeNull();
  });

  it("keeps both renames when both were planned to the same name", () => {
    const state = setup({ documentTarget: TARGET });
    expect(reconcileSharedName(input(state, TARGET))).toEqual({ associationTarget: TARGET, skipped: 0 });
    expect(state.documentPlan.get("p1")).toEqual({ renamedTo: TARGET, skipped: 0 });
    expect(state.renames.map.get(QNAME)).toBe(`MyModule.${TARGET}`);
  });

  it("renames the document along with the association", () => {
    const state = setup();
    expect(reconcileSharedName(input(state, TARGET))).toEqual({ associationTarget: TARGET, skipped: 0 });
    expect(state.documentPlan.get("p1")).toEqual({ renamedTo: TARGET, skipped: 0 });
    expect(state.documentNames.isFree("MyModule", TARGET)).toBe(false);
    expect(state.documentNames.isFree("MyModule", NAME)).toBe(true);
    expect([...state.renames.map]).toEqual([
      [`${QNAME}.OrderList`, `MyModule.${TARGET}.PurchaseList`],
      [QNAME, `MyModule.${TARGET}`],
    ]);
  });

  it("renames an unconnected association along with the document", () => {
    const state = setup({ documentTarget: TARGET });
    expect(reconcileSharedName(input(state, null))).toEqual({ associationTarget: TARGET, skipped: 0 });
    expect(state.documentPlan.get("p1").renamedTo).toBe(TARGET);
  });

  it("revokes the document rename when the association name is taken", () => {
    const state = setup({ documentTarget: TARGET });
    const outcome = reconcileSharedName(input(state, null, (name) => name !== TARGET));
    expect(outcome).toEqual({ associationTarget: null, skipped: 1 });
    expect(state.documentPlan.get("p1")).toEqual({ renamedTo: null, skipped: 1 });
    expect(state.documentNames.isFree("MyModule", NAME)).toBe(false);
    expect(state.documentNames.isFree("MyModule", TARGET)).toBe(true);
    expect([...state.renames.map]).toEqual([[`${QNAME}.OrderList`, `${QNAME}.PurchaseList`]]);
  });

  it("skips the association when the document name is taken", () => {
    const state = setup({ taken: [TARGET] });
    expect(reconcileSharedName(input(state, TARGET))).toEqual({ associationTarget: null, skipped: 1 });
    expect(state.documentPlan.get("p1").renamedTo).toBeNull();
    expect(state.renames.map.has(QNAME)).toBe(false);
  });

  it("skips the association when the document is a type that is not renamed", () => {
    const state = setup({ planned: false });
    expect(reconcileSharedName(input(state, TARGET))).toEqual({ associationTarget: null, skipped: 1 });
    expect(state.renames.size).toBe(0);
  });

  it("skips both when the planned names differ", () => {
    const state = setup({ documentTarget: "Something_Else" });
    expect(reconcileSharedName(input(state, TARGET))).toEqual({ associationTarget: null, skipped: 1 });
    expect(state.documentPlan.get("p1")).toEqual({ renamedTo: null, skipped: 1 });
    expect(state.renames.map.has(QNAME)).toBe(false);
  });
});
