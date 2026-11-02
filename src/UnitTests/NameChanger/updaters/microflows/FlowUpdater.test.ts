import type { Microflows, Primitives } from "@mendix/extensions-api";
import { describe, expect, it, vi } from "vitest";
import { entityRenames } from "../../../../NameChanger/framework/RenameContext";
import { DocumentNameRegistry } from "../../../../shared/rename/DocumentNameRegistry";
import { DocumentRenamePlan } from "../../../../NameChanger/framework/DocumentRenamePlan";
import { NamingPolicy } from "../../../../NameChanger/framework/NamingPolicy";
import { ReferenceIndex } from "../../../../shared/rename/ReferenceIndex";
import type { UpdaterMode } from "../../../../shared/rename/types";
import { fakeContext } from "../../helpers/fakes";
import { fakeUnitAccess, fakeUnitInfo } from "../../../shared/helpers/fakes";
import { action, activity, microflow, microflowObject, objectType, parameter, stringType } from "../../helpers/microflowBuilders";
import { FlowUpdater, type FlowUnitType, type FlowUpdaterDeps } from "../../../../NameChanger/updaters/microflows/FlowUpdater";
import { MicroflowHelper } from "../../../../NameChanger/updaters/microflows/MicroflowHelper";
import { type FlowReferences, ReferenceCache } from "../../../../NameChanger/updaters/microflows/ReferenceCache";
import type { ReferenceResolver } from "../../../../NameChanger/updaters/microflows/ReferenceResolver";

const context = fakeContext();
const QNAME = "MyModule.Order";
type Flow = Microflows.Microflow | Microflows.Nanoflow | Microflows.Rule;
const KINDS = {
  Microflows$Microflow: { kind: "microflow", label: "Microflows" },
  Microflows$Nanoflow: { kind: "nanoflow", label: "Nanoflows" },
  Microflows$Rule: { kind: "rule", label: "Rules" },
};

function setup(documents: string[] = [], unitType: FlowUnitType = "Microflows$Microflow") {
  const references = new ReferenceCache();
  // Stands in for the resolver: records what was asked and fills the shared cache.
  const resolver = {
    resolveAll: vi.fn(async (refs: FlowReferences) => {
      refs.microflows.forEach((qName) => references.microflowReturnEntities.set(qName, QNAME));
      refs.nanoflows.forEach((qName) => references.nanoflowReturnEntities.set(qName, QNAME));
    }),
  };
  const documentNames = new DocumentNameRegistry();
  documents.forEach((name) => documentNames.add("MyModule", name));
  const deps: FlowUpdaterDeps = {
    helper: new MicroflowHelper(context, new NamingPolicy(context.oldName, context.newName, []), references),
    resolver: resolver as unknown as ReferenceResolver,
    documentNames,
    renames: entityRenames(context),
    plan: new DocumentRenamePlan(),
  };
  const { kind, label } = KINDS[unitType];
  const create = (mode: UpdaterMode) =>
    new FlowUpdater<Flow>(
      { label, unitType, kind, description: "Testing", mode },
      fakeUnitAccess([]),
      deps,
    );
  const planner = create("plan");
  const renamer = create("rename");
  // Plans, then renames, like the job does.
  const run = async (flow: Flow, info: Readonly<Primitives.UnitInfo>) => {
    expect(await planner.update(flow, info)).toMatchObject({ changed: false });
    return renamer.update(flow, info);
  };
  return { planner, renamer, run, resolver, deps };
}

const info = (name: string) => fakeUnitInfo("mf-1", "Microflows$Microflow", "MyModule", name);

// A nanoflow only holds its parameters in the object collection.
function nanoflow(spec: Parameters<typeof microflow>[0]): Microflows.Nanoflow {
  const flow = microflow(spec) as unknown as Record<string, unknown>;
  delete flow.parameters;
  return flow as unknown as Microflows.Nanoflow;
}

// A rule has a boolean (or enumeration) return type and RuleParameter entries in its parameters list.
function rule(spec: Parameters<typeof microflow>[0]): Microflows.Rule {
  const flow = microflow({ returnType: { $Type: "DataTypes$BooleanType" } as never, ...spec }) as unknown as Record<string, unknown>;
  flow.$Type = "Microflows$Rule";
  flow.parameters = (flow.parameters as { name: string }[]).map((p) => ({ $Type: "Microflows$RuleParameter", ...p }));
  return flow as unknown as Microflows.Rule;
}

describe("FlowUpdater plan", () => {
  it("has the spec metadata", () => {
    const { planner } = setup();
    expect(planner).toMatchObject({ label: "Microflows", unitType: "Microflows$Microflow", implemented: true, description: "Testing" });
  });

  it("changes nothing in the unit and reports it unchanged", async () => {
    const { planner } = setup(["ACT_Order"]);
    const param = parameter("Order", objectType(QNAME));
    const create = action("CreateObjectAction", { entity: QNAME, outputVariableName: "NewOrder", items: [] });
    const flow = microflow({ name: "ACT_Order", objects: [param, activity(create)] });
    const before = JSON.stringify(flow);
    expect(await planner.update(flow, info(flow.name))).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
    expect(JSON.stringify(flow)).toBe(before);
  });

  it("records the document and parameter renames and reserves the new name", async () => {
    const { planner, deps } = setup(["ACT_Order"]);
    const flow = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    await planner.update(flow, info(flow.name));
    expect([...deps.renames.map]).toEqual([
      [QNAME, "MyModule.Purchase"],
      ["MyModule.ACT_Order", "MyModule.ACT_Purchase"],
      ["MyModule.ACT_Order.Order", "MyModule.ACT_Purchase.Purchase"],
    ]);
    expect(deps.plan.get("mf-1")).toEqual({ renamedTo: "ACT_Purchase", skipped: 0 });
    expect(deps.documentNames.isFree("MyModule", "ACT_Purchase")).toBe(false);
  });

  it("records parameter renames of a flow that keeps its name", async () => {
    const { planner, deps } = setup();
    const flow = microflow({ name: "ACT_Process", objects: [parameter("OrderList", objectType(QNAME))] });
    await planner.update(flow, info(flow.name));
    expect(deps.renames.map.get("MyModule.ACT_Process.OrderList")).toBe("MyModule.ACT_Process.PurchaseList");
    expect(deps.plan.get("mf-1").renamedTo).toBeNull();
  });

  it("resolves references", async () => {
    const { planner, resolver } = setup();
    const call = action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "MyModule.Sub", parameterMappings: [] }, outputVariableName: "SubOrder" });
    await planner.update(microflow({ name: "ACT_Process", objects: [activity(call)] }), info("ACT_Process"));
    expect([...resolver.resolveAll.mock.calls[0][0].microflows]).toEqual(["MyModule.Sub"]);
  });

  it("lets the rename phase load only flows with planned work", async () => {
    const { planner, renamer } = setup(["ACT_Order_Get", "ACT_Purchase_Get"]);
    const flows: [string, Flow][] = [
      ["unrelated", microflow({ name: "ACT_Customer", objects: [parameter("Customer", stringType())] })],
      ["variable", microflow({ name: "ACT_Process", objects: [parameter("Order", objectType(QNAME))] })],
      ["return", microflow({ name: "GET_Data", returnType: objectType(QNAME), returnVariableName: "Order" })],
      ["document", microflow({ name: "ACT_Order_Save", objects: [parameter("Customer", objectType(QNAME))] })],
      ["skipped", microflow({ name: "ACT_Order_Get", objects: [parameter("Customer", objectType(QNAME))] })],
    ];
    for (const [id, flow] of flows) {
      await planner.update(flow, fakeUnitInfo(id, "Microflows$Microflow", "MyModule", flow.name));
    }
    const accepted = flows.map(([id]) => renamer.accepts(fakeUnitInfo(id, "Microflows$Microflow")));
    expect(accepted).toEqual([false, true, true, true, true]);
    expect(planner.accepts(fakeUnitInfo("unrelated", "Microflows$Microflow"))).toBe(true);
  });

  it("does not record anything for a unit without a module", async () => {
    const { planner, deps } = setup();
    const flow = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    await planner.update(flow, { $ID: "mf-1", $Type: "Microflows$Microflow", name: "ACT_Order" } as never);
    expect(deps.renames.size).toBe(1);
    expect(deps.plan.get("mf-1").renamedTo).toBeNull();
  });
});

describe("FlowUpdater rename", () => {
  it("reports an unrelated flow as unchanged", async () => {
    const { run } = setup();
    const flow = microflow({ name: "ACT_Customer", objects: [parameter("Customer", stringType())] });
    expect(await run(flow, info(flow.name))).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
  });

  it("renames variables and their usages and leaves entity references to the reference pass", async () => {
    const { run } = setup();
    const commit = action("CommitAction", { commitVariableName: "Order" });
    const param = parameter("Order", objectType(QNAME));
    const flow = microflow({ name: "ACT_Process", objects: [param, activity(commit)] });
    const result = await run(flow, info(flow.name));
    expect(result).toEqual({ changed: true, renamedTo: null, renamedVariables: 1, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
    expect(commit.commitVariableName).toBe("Purchase");
    expect((param as Microflows.MicroflowParameterObject).variableType).toMatchObject({ entity: QNAME });
  });

  it("uses the references resolved in the plan phase and resolves nothing itself", async () => {
    const { run, resolver } = setup();
    const call = action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "MyModule.Sub", parameterMappings: [] }, outputVariableName: "SubOrder" });
    const result = await run(microflow({ name: "ACT_Process", objects: [activity(call)] }), info("ACT_Process"));
    expect(result.renamedVariables).toBe(1);
    expect(call.outputVariableName).toBe("SubPurchase");
    expect(resolver.resolveAll).toHaveBeenCalledTimes(1);
  });

  it("applies the planned document rename and leaves calls to renamed flows to the reference pass", async () => {
    const { planner, renamer, deps } = setup(["ACT_Order", "ACT_Caller"]);
    const callee = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    const call = action("MicroflowCallAction", { useReturnVariable: false, microflowCall: { $Type: "Microflows$MicroflowCall", microflow: "MyModule.ACT_Order", parameterMappings: [] }, outputVariableName: "" });
    const caller = microflow({ name: "ACT_Caller", objects: [activity(call)] });
    const calleeInfo = fakeUnitInfo("mf-callee", "Microflows$Microflow", "MyModule", "ACT_Order");
    const callerInfo = fakeUnitInfo("mf-caller", "Microflows$Microflow", "MyModule", "ACT_Caller");
    await planner.update(caller, callerInfo);
    await planner.update(callee, calleeInfo);
    expect(deps.plan.get("mf-callee").renamedTo).toBe("ACT_Purchase");
    expect(await renamer.update(caller, callerInfo)).toMatchObject({ changed: false });
    expect((call.microflowCall as { microflow: string }).microflow).toBe("MyModule.ACT_Order");
    expect(await renamer.update(callee, calleeInfo)).toMatchObject({ changed: true, renamedTo: "ACT_Purchase", renamedVariables: 1 });
    expect(callee.name).toBe("ACT_Purchase");
  });

  it("does not rename a document without a plan", async () => {
    const { renamer } = setup(["ACT_Order"]);
    const flow = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    expect((await renamer.update(flow, info(flow.name))).renamedTo).toBeNull();
    expect(flow.name).toBe("ACT_Order");
  });

  it("counts a skipped document rename once, in the rename phase", async () => {
    const { run } = setup(["ACT_Order", "ACT_Purchase"]);
    const flow = microflow({ name: "ACT_Order", returnType: objectType(QNAME), returnVariableName: "Customer" });
    const result = await run(flow, info(flow.name));
    expect(result).toEqual({ changed: false, renamedTo: null, renamedVariables: 0, updatedReferences: 0, skippedRenames: 1, renamedAssociations: 0 });
    expect(flow.name).toBe("ACT_Order");
  });

  it("does not rename a document named after the entity that does not use it", async () => {
    const { run } = setup();
    const flow = microflow({ name: "ACT_Order" });
    expect((await run(flow, info(flow.name))).renamedTo).toBeNull();
  });

  it("counts a changed return variable name as a change", async () => {
    const { run } = setup();
    const flow = microflow({ name: "GET_Data", returnType: stringType(), returnVariableName: "Order" });
    expect((await run(flow, info(flow.name))).changed).toBe(false);
    const entityFlow = microflow({ name: "GET_Data", returnType: objectType(QNAME), returnVariableName: "Order" });
    expect((await run(entityFlow, info(entityFlow.name))).changed).toBe(true);
    expect(entityFlow.returnVariableName).toBe("Purchase");
  });

  it("resets state between flows", async () => {
    const { run } = setup();
    const first = microflow({ name: "ACT_A", objects: [parameter("Order", objectType(QNAME))] });
    await run(first, info(first.name));
    const second = microflow({ name: "ACT_B", objects: [parameter("Customer", stringType())] });
    expect((await run(second, fakeUnitInfo("mf-2", "Microflows$Microflow", "MyModule", "ACT_B"))).changed).toBe(false);
  });

  it("returns the counts of the flow it processed", async () => {
    const { run } = setup();
    const flow = microflow({
      name: "ACT_Two",
      objects: [
        parameter("Order", objectType(QNAME)),
        activity(action("CreateObjectAction", { entity: QNAME, outputVariableName: "NewOrder", items: [] })),
      ],
    });
    expect(await run(flow, info(flow.name))).toMatchObject({ renamedVariables: 2, updatedReferences: 0 });
  });
});

describe("FlowUpdater rename with existing names", () => {
  // The entity's domain model (dm-1) and the units in `saved` count as saved.
  function withReferences(saved: string[] = []) {
    const s = setup(["ACT_Order", "ACT_Caller"]);
    const index = new ReferenceIndex();
    const savedIds = new Set(["dm-1", ...saved]);
    s.deps.references = { isSaved: (id) => savedIds.has(id), index };
    return { ...s, index, savedIds };
  }

  const callerOf = (callee: string) => {
    const call = action("MicroflowCallAction", { useReturnVariable: false, microflowCall: { $Type: "Microflows$MicroflowCall", microflow: callee, parameterMappings: [] }, outputVariableName: "" });
    const param = parameter("Order", objectType(QNAME));
    return { call, param, flow: microflow({ name: "ACT_Caller", objects: [param, activity(call)] }) };
  };

  it("rewrites references to names that exist and marks the flow up to date", async () => {
    const { run, index } = withReferences();
    const { param, flow } = callerOf("MyModule.Other");
    const result = await run(flow, info(flow.name));
    expect(result).toMatchObject({ changed: true, renamedVariables: 1, updatedReferences: 1 });
    expect((param as Microflows.MicroflowParameterObject).variableType).toMatchObject({ entity: "MyModule.Purchase" });
    expect(index.isUpToDate("mf-1")).toBe(true);
  });

  it("leaves a callee renamed later to the reference pass and does not mark the flow", async () => {
    const { planner, renamer, index } = withReferences();
    const callee = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    const { call, param, flow } = callerOf("MyModule.ACT_Order");
    const calleeInfo = fakeUnitInfo("mf-callee", "Microflows$Microflow", "MyModule", "ACT_Order");
    const callerInfo = fakeUnitInfo("mf-caller", "Microflows$Microflow", "MyModule", "ACT_Caller");
    await planner.update(flow, callerInfo);
    await planner.update(callee, calleeInfo);
    expect(await renamer.update(flow, callerInfo)).toMatchObject({ changed: true, updatedReferences: 1 });
    expect((param as Microflows.MicroflowParameterObject).variableType).toMatchObject({ entity: "MyModule.Purchase" });
    expect((call.microflowCall as { microflow: string }).microflow).toBe("MyModule.ACT_Order");
    expect(index.isUpToDate("mf-caller")).toBe(false);
  });

  it("rewrites a call to a callee saved earlier", async () => {
    const { planner, renamer, index, savedIds } = withReferences();
    const callee = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    const { call, flow } = callerOf("MyModule.ACT_Order");
    const calleeInfo = fakeUnitInfo("mf-callee", "Microflows$Microflow", "MyModule", "ACT_Order");
    const callerInfo = fakeUnitInfo("mf-caller", "Microflows$Microflow", "MyModule", "ACT_Caller");
    await planner.update(callee, calleeInfo);
    await planner.update(flow, callerInfo);
    await renamer.update(callee, calleeInfo);
    savedIds.add("mf-callee");
    expect((await renamer.update(flow, callerInfo)).updatedReferences).toBe(2);
    expect((call.microflowCall as { microflow: string }).microflow).toBe("MyModule.ACT_Purchase");
    expect(index.isUpToDate("mf-caller")).toBe(true);
  });

  it("records the declaring flow of its document and parameter renames", async () => {
    const { planner, deps } = withReferences();
    const flow = microflow({ name: "ACT_Order", objects: [parameter("Order", objectType(QNAME))] });
    await planner.update(flow, info(flow.name));
    expect([...deps.renames.existing((id) => id === "mf-1").keys()]).toEqual(["MyModule.ACT_Order", "MyModule.ACT_Order.Order"]);
  });
});

describe("FlowUpdater for nanoflows", () => {
  it("renames parameters, variables and the nanoflow, and records them", async () => {
    const { run, deps } = setup(["ACT_Order_Show"], "Microflows$Nanoflow");
    const call = action("NanoflowCallAction", { useReturnVariable: true, nanoflowCall: { nanoflow: "MyModule.SUB_Get", parameterMappings: [{ argument: "$Order" }] }, outputVariableName: "FoundOrder" });
    const flow = nanoflow({ name: "ACT_Order_Show", objects: [parameter("Order", objectType(QNAME)), activity(call)] });
    const result = await run(flow, fakeUnitInfo("nf-1", "Microflows$Nanoflow", "MyModule", flow.name));
    expect(result).toMatchObject({ changed: true, renamedTo: "ACT_Purchase_Show", renamedVariables: 2 });
    expect((flow.objectCollection.objects[0] as Microflows.MicroflowParameterObject).name).toBe("Purchase");
    expect(call.outputVariableName).toBe("FoundPurchase");
    expect((call.nanoflowCall as { parameterMappings: { argument: string }[] }).parameterMappings[0].argument).toBe("$Purchase");
    expect(deps.renames.map.get("MyModule.ACT_Order_Show.Order")).toBe("MyModule.ACT_Purchase_Show.Purchase");
  });
});

describe("FlowUpdater for rules", () => {
  const ruleInfo = (name: string) => fakeUnitInfo("rl-1", "Microflows$Rule", "MyModule", name);

  it("has the rule metadata", () => {
    const { planner } = setup([], "Microflows$Rule");
    expect(planner).toMatchObject({ label: "Rules", unitType: "Microflows$Rule", implemented: true });
  });

  it("plans the rule and parameter renames without changing the rule", async () => {
    const { planner, deps } = setup(["Order_IsValid"], "Microflows$Rule");
    const flow = rule({ name: "Order_IsValid", objects: [parameter("Order", objectType(QNAME))] });
    const before = JSON.stringify(flow);
    expect(await planner.update(flow, ruleInfo(flow.name))).toMatchObject({ changed: false });
    expect(JSON.stringify(flow)).toBe(before);
    expect(deps.plan.get("rl-1")).toEqual({ renamedTo: "Purchase_IsValid", skipped: 0 });
    expect(deps.renames.map.get("MyModule.Order_IsValid")).toBe("MyModule.Purchase_IsValid");
    expect(deps.renames.map.get("MyModule.Order_IsValid.Order")).toBe("MyModule.Purchase_IsValid.Purchase");
  });

  it("renames the rule, its parameter object and listed parameter, and their usages", async () => {
    const { run } = setup(["Order_IsValid"], "Microflows$Rule");
    const split = microflowObject("ExclusiveSplit", { splitCondition: { $Type: "Microflows$ExpressionSplitCondition", expression: "$Order/Total > 0" } });
    const end = microflowObject("EndEvent", { returnValue: "$Order/Valid" });
    const flow = rule({ name: "Order_IsValid", objects: [parameter("Order", objectType(QNAME)), split, end] });
    const result = await run(flow, ruleInfo(flow.name));
    expect(result).toEqual({ changed: true, renamedTo: "Purchase_IsValid", renamedVariables: 1, updatedReferences: 0, skippedRenames: 0, renamedAssociations: 0 });
    expect(flow.name).toBe("Purchase_IsValid");
    expect((flow.objectCollection.objects[0] as Microflows.MicroflowParameterObject).name).toBe("Purchase");
    expect(flow.parameters[0]).toMatchObject({ $Type: "Microflows$RuleParameter", name: "Purchase" });
    expect((split as unknown as { splitCondition: { expression: string } }).splitCondition.expression).toBe("$Purchase/Total > 0");
    expect((end as unknown as { returnValue: string }).returnValue).toBe("$Purchase/Valid");
  });

  it("keeps the return variable name of a boolean rule", async () => {
    const { run } = setup([], "Microflows$Rule");
    const flow = rule({ name: "IsValid", objects: [parameter("Order", objectType(QNAME))], returnVariableName: "Order" });
    await run(flow, ruleInfo(flow.name));
    expect(flow.returnVariableName).toBe("Order");
  });

  it("reports a rule without the entity as unchanged", async () => {
    const { run } = setup(["Order_IsValid"], "Microflows$Rule");
    const flow = rule({ name: "Order_IsValid", objects: [parameter("Customer", stringType())] });
    expect(await run(flow, ruleInfo(flow.name))).toMatchObject({ changed: false, renamedTo: null });
    expect(flow.name).toBe("Order_IsValid");
  });

  it("renames a rule whose parameters list is undefined, as seen in Studio Pro", async () => {
    const { run } = setup(["Order_IsValid"], "Microflows$Rule");
    const flow = rule({ name: "Order_IsValid", objects: [parameter("Order", objectType(QNAME))] });
    (flow as unknown as Record<string, unknown>).parameters = undefined;
    expect(await run(flow, ruleInfo(flow.name))).toMatchObject({ changed: true, renamedTo: "Purchase_IsValid", renamedVariables: 1 });
    expect((flow.objectCollection.objects[0] as Microflows.MicroflowParameterObject).name).toBe("Purchase");
  });

  it("does not rename a listed parameter without a parameter object", async () => {
    const { run } = setup([], "Microflows$Rule");
    const flow = rule({ name: "IsValid", parameters: [{ name: "Order" }] });
    expect((await run(flow, ruleInfo(flow.name))).changed).toBe(false);
    expect(flow.parameters[0].name).toBe("Order");
  });
});
