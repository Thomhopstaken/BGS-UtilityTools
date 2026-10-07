import type { Microflows } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { DocumentNameRegistry } from "../../../../EntityNameChanger/framework/DocumentNameRegistry";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { fakeContext, fakeUnitAccess, fakeUnitInfo } from "../../helpers/fakes";
import { action, activity, microflow, objectType, parameter, stringType } from "../../helpers/microflowBuilders";
import { MicroflowHelper } from "../../../../EntityNameChanger/updaters/microflows/MicroflowHelper";
import { type FlowReferences, ReferenceCache } from "../../../../EntityNameChanger/updaters/microflows/ReferenceCache";
import type { ReferenceResolver } from "../../../../EntityNameChanger/updaters/microflows/ReferenceResolver";
import { MicroflowUpdater } from "../../../../EntityNameChanger/updaters/microflows/MicroflowUpdater";

const context = fakeContext();
const QNAME = "MyModule.Order";

function setup(documents: string[] = []) {
  const references = new ReferenceCache();
  const helper = new MicroflowHelper(context, new NamingPolicy(context.oldName, context.newName, []), references);
  // Stands in for the resolver: records what was asked and fills the shared cache.
  const resolver = {
    resolveAll: vi.fn(async (refs: FlowReferences) => {
      refs.microflows.forEach((qName) => references.microflowReturnEntities.set(qName, QNAME));
    }),
  };
  const names = new DocumentNameRegistry();
  documents.forEach((name) => names.add("MyModule", name));
  const updater = new MicroflowUpdater(fakeUnitAccess([]), helper, resolver as unknown as ReferenceResolver, names);
  return { updater, resolver, names };
}

const info = (name: string) => fakeUnitInfo("mf-1", "Microflows$Microflow", "MyModule", name);

describe("MicroflowUpdater", () => {
  it("has the microflow metadata", () => {
    const { updater } = setup();
    expect(updater).toMatchObject({ label: "Microflows", unitType: "Microflows$Microflow", implemented: true });
  });

  it("reports an unrelated flow as unchanged", async () => {
    const { updater } = setup();
    const flow = microflow({ name: "ACT_Customer", objects: [parameter("Customer", stringType())] });
    expect(await updater.update(flow, info(flow.name))).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, skippedRenames: 0 });
  });

  it("renames variables and their usages", async () => {
    const { updater } = setup();
    const commit = action("CommitAction", { commitVariableName: "Order" });
    const flow = microflow({ name: "ACT_Process", objects: [parameter("Order", objectType(QNAME)), activity(commit)] });
    const result = await updater.update(flow, info(flow.name));
    expect(result).toEqual({ changed: true, renamedTo: null, renamedVariables: 1, skippedRenames: 0 });
    expect(commit.commitVariableName).toBe("Purchase");
  });

  it("resolves references before detection", async () => {
    const { updater, resolver } = setup();
    const call = action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "MyModule.Sub", parameterMappings: [] }, outputVariableName: "SubOrder" });
    const flow = microflow({ name: "ACT_Process", objects: [activity(call)] });
    const result = await updater.update(flow, info(flow.name));
    expect([...resolver.resolveAll.mock.calls[0][0].microflows]).toEqual(["MyModule.Sub"]);
    expect(result.renamedVariables).toBe(1);
    expect(call.outputVariableName).toBe("SubPurchase");
  });

  it("renames the document when it uses the entity and the name is free", async () => {
    const { updater, names } = setup(["ACT_Order"]);
    const flow = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    const result = await updater.update(flow, info(flow.name));
    expect(result).toMatchObject({ changed: true, renamedTo: "ACT_Purchase", renamedVariables: 1 });
    expect(flow.name).toBe("ACT_Purchase");
    expect(names.isFree("MyModule", "ACT_Order")).toBe(true);
    expect(names.isFree("MyModule", "ACT_Purchase")).toBe(false);
  });

  it("skips the document rename when the new name is taken", async () => {
    const { updater } = setup(["ACT_Order", "ACT_Purchase"]);
    const flow = microflow({ name: "ACT_Order", returnType: objectType(QNAME), returnVariableName: "Customer" });
    const result = await updater.update(flow, info(flow.name));
    expect(result).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, skippedRenames: 1 });
    expect(flow.name).toBe("ACT_Order");
  });

  it("does not rename a document named after the entity that does not use it", async () => {
    const { updater } = setup();
    const flow = microflow({ name: "ACT_Order" });
    expect((await updater.update(flow, info(flow.name))).renamedTo).toBeNull();
  });

  it("does not rename the document of a unit without a module", async () => {
    const { updater } = setup();
    const flow = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    const result = await updater.update(flow, { $ID: "mf-1", $Type: "Microflows$Microflow", name: "ACT_Order" } as never);
    expect(result.renamedTo).toBeNull();
    expect(flow.name).toBe("ACT_Order");
  });

  it("counts a changed return variable name as a change", async () => {
    const { updater } = setup();
    const flow = microflow({ name: "GET_Data", returnType: objectType(QNAME), returnVariableName: "Order" });
    const result = await updater.update(flow, info(flow.name));
    expect(result.changed).toBe(true);
    expect(flow.returnVariableName).toBe("Purchase");
  });

  it("resets state between flows", async () => {
    const { updater } = setup();
    const first = microflow({ name: "ACT_A", objects: [parameter("Order", objectType(QNAME))] });
    await updater.update(first, info(first.name));
    const second = microflow({ name: "ACT_B", objects: [parameter("Customer", stringType())] });
    expect((await updater.update(second, info(second.name))).changed).toBe(false);
  });

  it("returns the counts of the flow it processed", async () => {
    const { updater } = setup();
    const flow = microflow({
      name: "ACT_Two",
      objects: [
        parameter("Order", objectType(QNAME)),
        activity(action("CreateObjectAction", { entity: QNAME, outputVariableName: "NewOrder", items: [] })),
      ],
    }) as Microflows.Microflow;
    expect((await updater.update(flow, info(flow.name))).renamedVariables).toBe(2);
  });
});
