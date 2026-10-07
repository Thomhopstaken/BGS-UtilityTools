import type { Microflows } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { fakeContext } from "../../helpers/fakes";
import {
  action,
  activity,
  customRange,
  type FlowSpec,
  iterableList,
  listType,
  loop,
  microflow,
  microflowObject,
  objectType,
  parameter,
  sequenceFlow,
  stringType,
  template,
} from "../../helpers/microflowBuilders";
import { MicroflowHelper } from "../../../../EntityNameChanger/updaters/microflows/MicroflowHelper";
import { emptyFlowReferences, type JavaActionSignature, ReferenceCache } from "../../../../EntityNameChanger/updaters/microflows/ReferenceCache";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
const QNAME = "MyModule.Order";

function newHelper(references = new ReferenceCache()): MicroflowHelper {
  return new MicroflowHelper(context, new NamingPolicy(context.oldName, context.newName, context.protectedNames), references);
}

function detect(objects: Microflows.MicroflowObject[], references?: ReferenceCache, spec: FlowSpec = {}) {
  const helper = newHelper(references);
  const flow = microflow({ ...spec, objects });
  helper.detectEntityVariables(flow);
  return { helper, flow };
}

const renamesOf = (helper: MicroflowHelper) => helper.renames.map((r) => [r.oldName, r.newName]);

// A helper with one pending rename: Order -> Purchase.
function prepared(): MicroflowHelper {
  const { helper } = detect([parameter("Order", objectType(QNAME))]);
  expect(renamesOf(helper)).toEqual([["Order", "Purchase"]]);
  return helper;
}

describe("collectReferences", () => {
  it("collects every reference kind, including inside loops", () => {
    const objects = [
      activity(action("RetrieveAction", { retrieveSource: { $Type: "Microflows$AssociationRetrieveSource", association: "M.Assoc" } })),
      activity(action("RetrieveAction", { retrieveSource: { $Type: "Microflows$AssociationRetrieveSource", association: null } })),
      activity(action("RetrieveAction", { retrieveSource: { $Type: "Microflows$DatabaseRetrieveSource", entity: QNAME } })),
      activity(action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "M.Sub" } })),
      activity(action("MicroflowCallAction", { useReturnVariable: false, microflowCall: { microflow: "M.NoReturn" } })),
      activity(action("JavaActionCallAction", { useReturnVariable: true, javaAction: "M.Java" })),
      activity(action("JavaActionCallAction", { useReturnVariable: false, javaAction: "M.NoJava" })),
      activity(action("GetWorkflowDataAction", { workflow: "M.Wf" })),
      activity(action("GetWorkflowDataAction", { workflow: null })),
      activity(action("RestOperationCallAction", { operation: "M.Api.Get", outputVariable: { variableName: "Out" } })),
      activity(action("RestOperationCallAction", { operation: "M.Api.Post", outputVariable: null })),
      activity(action("MLModelCallAction", { mlMappingDocument: "M.Ml" })),
      activity(null),
      microflowObject("EndEvent", { returnValue: null }),
      loop(iterableList("It", "List"), [activity(action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "M.Inner" } }))]),
    ];
    const refs = newHelper().collectReferences(objects);
    expect([...refs.associations]).toEqual(["M.Assoc"]);
    expect([...refs.microflows]).toEqual(["M.Sub", "M.Inner"]);
    expect([...refs.javaActions]).toEqual(["M.Java"]);
    expect([...refs.workflows]).toEqual(["M.Wf"]);
    expect([...refs.restOperations]).toEqual(["M.Api.Get"]);
    expect([...refs.mlMappings]).toEqual(["M.Ml"]);
  });

  it("adds to the references passed in", () => {
    const refs = emptyFlowReferences();
    refs.workflows.add("M.Existing");
    const result = newHelper().collectReferences([activity(action("GetWorkflowDataAction", { workflow: "M.New" }))], refs);
    expect(result).toBe(refs);
    expect([...refs.workflows]).toEqual(["M.Existing", "M.New"]);
  });
});

describe("detectEntityVariables", () => {
  it("renames entity parameters and their entry in the parameters list", () => {
    const param = parameter("Order", objectType(QNAME));
    const other = parameter("Customer", objectType("MyModule.Customer"));
    const { helper, flow } = detect([param, other]);
    expect(renamesOf(helper)).toEqual([["Order", "Purchase"]]);
    helper.applyRenames();
    expect((param as Microflows.MicroflowParameterObject).name).toBe("Purchase");
    expect(flow.parameters.map((p) => p.name)).toEqual(["Purchase", "Customer"]);
  });

  it("renames a parameter object when the flow has no parameters list", () => {
    const param = parameter("Order", objectType(QNAME));
    const helper = newHelper();
    const flow = microflow({ objects: [param] }) as unknown as Record<string, unknown>;
    delete flow.parameters;
    helper.detectEntityVariables(flow as unknown as Microflows.MicroflowBase);
    helper.applyRenames();
    expect((param as Microflows.MicroflowParameterObject).name).toBe("Purchase");
  });

  it("renames only the parameter object when the list entry is missing", () => {
    const param = parameter("Order", objectType(QNAME));
    const { helper, flow } = detect([param], undefined, { parameters: [{ name: "Other" }] });
    helper.applyRenames();
    expect((param as Microflows.MicroflowParameterObject).name).toBe("Purchase");
    expect(flow.parameters.map((p) => p.name)).toEqual(["Other"]);
  });

  it.each([
    ["CreateObjectAction", { entity: QNAME, outputVariableName: "NewOrder" }, "NewPurchase"],
    ["CreateListAction", { entity: QNAME, outputVariableName: "OrderList" }, "PurchaseList"],
    ["RetrieveAction", { retrieveSource: { $Type: "Microflows$DatabaseRetrieveSource", entity: QNAME }, outputVariableName: "OrderList" }, "PurchaseList"],
    ["CreateVariableAction", { variableType: objectType(QNAME), variableName: "MyOrder" }, "MyPurchase"],
    ["CallExternalAction", { variableDataType: listType(QNAME), variableName: "Orders" }, "Purchases"],
  ])("detects the output of %s", (type, props, expected) => {
    const target = action(type, props);
    const { helper } = detect([activity(target)]);
    helper.applyRenames();
    expect(target.outputVariableName ?? target.variableName).toBe(expected);
  });

  it.each(["CreateObjectAction", "CreateListAction"])("ignores %s of another entity", (type) => {
    const { helper } = detect([activity(action(type, { entity: "MyModule.Customer", outputVariableName: "NewOrder" }))]);
    expect(helper.renames).toEqual([]);
  });

  it("ignores an empty output name", () => {
    const { helper } = detect([activity(action("CreateObjectAction", { entity: QNAME, outputVariableName: "" }))]);
    expect(helper.entityVariables.size).toBe(0);
  });

  it.each(["RestCallAction", "WebServiceCallAction", "ImportXmlAction"])("detects the stored result of %s", (type) => {
    const resultHandling = { storeInVariable: true, variableType: objectType(QNAME), outputVariableName: "OrderResponse" };
    const notStored = { storeInVariable: false, variableType: objectType(QNAME), outputVariableName: "OrderIgnored" };
    const { helper } = detect([activity(action(type, { resultHandling })), activity(action(type, { resultHandling: notStored }))]);
    helper.applyRenames();
    expect(resultHandling.outputVariableName).toBe("PurchaseResponse");
    expect(notStored.outputVariableName).toBe("OrderIgnored");
  });

  describe("references resolved before detection", () => {
    it("detects a microflow call returning the entity", () => {
      const references = new ReferenceCache();
      references.microflowReturnEntities.set("M.Sub", QNAME);
      references.microflowReturnEntities.set("M.Other", "MyModule.Customer");
      const { helper } = detect(
        [
          activity(action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "M.Sub" }, outputVariableName: "SubOrder" })),
          activity(action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "M.Other" }, outputVariableName: "OtherOrder" })),
          activity(action("MicroflowCallAction", { useReturnVariable: true, microflowCall: { microflow: "M.Unresolved" }, outputVariableName: "UnresolvedOrder" })),
          activity(action("MicroflowCallAction", { useReturnVariable: false, microflowCall: { microflow: "M.Sub" }, outputVariableName: "NoReturnOrder" })),
        ],
        references,
      );
      expect(renamesOf(helper)).toEqual([["SubOrder", "SubPurchase"]]);
    });

    it("detects workflow data, rest operation and ml outputs", () => {
      const references = new ReferenceCache();
      references.workflowContextEntities.set("M.Wf", QNAME);
      references.restOperationEntities.set("M.Api.Get", QNAME);
      references.mlOutputEntities.set("M.Ml", QNAME);
      const outputVariable = { variableName: "OrderOut" };
      const { helper } = detect(
        [
          activity(action("GetWorkflowDataAction", { workflow: "M.Wf", outputVariableName: "WfOrder" })),
          activity(action("GetWorkflowDataAction", { workflow: "M.Unknown", outputVariableName: "UnknownOrder" })),
          activity(action("RestOperationCallAction", { operation: "M.Api.Get", outputVariable })),
          activity(action("RestOperationCallAction", { operation: "M.Api.Get", outputVariable: null })),
          activity(action("MLModelCallAction", { mlMappingDocument: "M.Ml", outputVariableName: "OrderPrediction" })),
          activity(action("MLModelCallAction", { mlMappingDocument: null, outputVariableName: "NoOrder" })),
        ],
        references,
      );
      expect(renamesOf(helper)).toEqual([
        ["WfOrder", "WfPurchase"],
        ["OrderOut", "PurchaseOut"],
        ["OrderPrediction", "PurchasePrediction"],
      ]);
      helper.applyRenames();
      expect(outputVariable.variableName).toBe("PurchaseOut");
    });
  });

  describe("association retrieves", () => {
    const association = (ends: { parent: string; child: string } | null, startVariableName: string, outputVariableName: string) => {
      const references = new ReferenceCache();
      references.associations.set("M.Order_Customer", ends);
      const objects = [
        parameter("Order", objectType(QNAME)),
        activity(
          action("RetrieveAction", {
            retrieveSource: { $Type: "Microflows$AssociationRetrieveSource", association: "M.Order_Customer", startVariableName },
            outputVariableName,
          }),
        ),
      ];
      return detect(objects, references).helper.entityVariables.has(outputVariableName);
    };

    it("detects the entity end when starting from the other end ($ID or qualified name)", () => {
      expect(association({ parent: "entity-1", child: "MyModule.Customer" }, "Customer", "CustomerOrder")).toBe(true);
      expect(association({ parent: "MyModule.Customer", child: QNAME }, "Customer", "CustomerOrder")).toBe(true);
    });

    it("ignores the other end when starting from an entity variable", () => {
      expect(association({ parent: "entity-1", child: "MyModule.Customer" }, "Order", "OrderCustomer")).toBe(false);
    });

    it("detects a self-association", () => {
      expect(association({ parent: "entity-1", child: QNAME }, "Order", "ParentOrder")).toBe(true);
    });

    it("ignores associations without the entity and unresolved ones", () => {
      expect(association({ parent: "x", child: "y" }, "Customer", "SomeOrder")).toBe(false);
      expect(association(null, "Customer", "SomeOrder")).toBe(false);
    });

    it("ignores unknown associations and a null association", () => {
      const { helper } = detect([
        activity(action("RetrieveAction", { retrieveSource: { $Type: "Microflows$AssociationRetrieveSource", association: "M.Unknown", startVariableName: "X" }, outputVariableName: "AOrder" })),
        activity(action("RetrieveAction", { retrieveSource: { $Type: "Microflows$AssociationRetrieveSource", association: null, startVariableName: "X" }, outputVariableName: "BOrder" })),
        activity(action("RetrieveAction", { retrieveSource: { $Type: "Microflows$Other" }, outputVariableName: "COrder" })),
      ]);
      expect(helper.entityVariables.size).toBe(0);
    });
  });

  describe("list operations and loops", () => {
    const retrieveList = () =>
      activity(action("RetrieveAction", { retrieveSource: { $Type: "Microflows$DatabaseRetrieveSource", entity: QNAME }, outputVariableName: "OrderList" }));

    it("detects list operation outputs on an entity list, except boolean ones", () => {
      const { helper } = detect([
        activity(action("ListOperationAction", { operation: { $Type: "Microflows$Head", listVariableName: "OrderList" }, outputVariableName: "FirstOrder" })),
        activity(action("ListOperationAction", { operation: { $Type: "Microflows$Contains", listVariableName: "OrderList" }, outputVariableName: "HasOrder" })),
        activity(action("ListOperationAction", { operation: { $Type: "Microflows$ListEquals", listVariableName: "OrderList" }, outputVariableName: "SameOrder" })),
        activity(action("ListOperationAction", { operation: { $Type: "Microflows$Head", listVariableName: "OtherList" }, outputVariableName: "OtherOrder" })),
        retrieveList(),
      ]);
      expect([...helper.entityVariables].sort()).toEqual(["FirstOrder", "OrderList"]);
    });

    it("repeats detection until stable, regardless of object order", () => {
      const source = iterableList("IteratorOrder", "OrderList");
      const { helper } = detect([loop(source), retrieveList()]);
      // Renames follow object order of the final pass.
      expect(renamesOf(helper)).toEqual([
        ["IteratorOrder", "IteratorPurchase"],
        ["OrderList", "PurchaseList"],
      ]);
      helper.applyRenames();
      expect(source.variableName).toBe("IteratorPurchase");
    });

    it("detects inside loop bodies", () => {
      const { helper } = detect([loop(iterableList("It", "Items"), [retrieveList()])]);
      expect([...helper.entityVariables]).toEqual(["OrderList"]);
    });
  });

  describe("casts", () => {
    const castFlow = (caseValue: string | null, viaMerge = false, splitKnown = true) => {
      const split = microflowObject("InheritanceSplit", { splitVariableName: "Base" });
      const merge = microflowObject("ExclusiveMerge");
      const cast = activity(action("CastAction", { outputVariableName: "CastOrder" }));
      const cases = caseValue === null ? [] : [{ $Type: "Microflows$InheritanceCase", value: caseValue }];
      const origin = splitKnown ? split.$ID : "unknown";
      const flows = viaMerge
        ? [sequenceFlow(origin, merge.$ID, cases), sequenceFlow(merge.$ID, cast.$ID)]
        : [sequenceFlow(origin, cast.$ID, cases)];
      return detect([split, merge, cast], undefined, { flows }).helper.entityVariables.has("CastOrder");
    };

    it("detects a cast after the entity's inheritance case", () => {
      expect(castFlow(QNAME)).toBe(true);
      expect(castFlow(QNAME, true)).toBe(true);
    });

    it("ignores casts to another specialization, without a split, or from an unknown origin", () => {
      expect(castFlow("MyModule.Other")).toBe(false);
      expect(castFlow(null)).toBe(false);
      expect(castFlow(QNAME, false, false)).toBe(false);
    });

    it("ignores a cast that is reached from two cases when one is another entity", () => {
      const split = microflowObject("InheritanceSplit", { splitVariableName: "Base" });
      const cast = activity(action("CastAction", { outputVariableName: "CastOrder" }));
      const flows = [
        sequenceFlow(split.$ID, cast.$ID, [{ $Type: "Microflows$InheritanceCase", value: QNAME }]),
        sequenceFlow(split.$ID, cast.$ID, [{ $Type: "Microflows$InheritanceCase", value: "MyModule.Other" }]),
      ];
      expect(detect([split, cast], undefined, { flows }).helper.entityVariables.size).toBe(0);
    });
  });

  describe("java action calls", () => {
    const javaCall = (signature: JavaActionSignature | null, parameterMappings: object[] = [], extra: Microflows.MicroflowObject[] = [], useReturnVariable = true) => {
      const references = new ReferenceCache();
      references.javaActions.set("M.Java", signature);
      const call = activity(action("JavaActionCallAction", { useReturnVariable, javaAction: "M.Java", outputVariableName: "OrderResult", parameterMappings }));
      return detect([...extra, call], references).helper.entityVariables.has("OrderResult");
    };
    const typed = (kind: "entityType" | "typed", name: string): JavaActionSignature => ({
      returnEntity: null,
      returnTypeParameter: "T",
      parameters: [{ name, kind, typeParameter: "T" }],
    });

    it("detects a concrete entity return", () => {
      expect(javaCall({ returnEntity: QNAME, returnTypeParameter: null, parameters: [] })).toBe(true);
      expect(javaCall({ returnEntity: "MyModule.Customer", returnTypeParameter: null, parameters: [] })).toBe(false);
    });

    it("ignores unresolved actions, unused returns and non-entity returns", () => {
      expect(javaCall(null)).toBe(false);
      expect(javaCall({ returnEntity: QNAME, returnTypeParameter: null, parameters: [] }, [], [], false)).toBe(false);
      expect(javaCall({ returnEntity: null, returnTypeParameter: null, parameters: [] })).toBe(false);
    });

    it("detects a type parameter bound by an entity-type argument", () => {
      const mapping = (entity: string) => ({
        parameter: "M.Java.EntityType",
        parameterValue: { $Type: "Microflows$EntityTypeCodeActionParameterValue", entity },
      });
      expect(javaCall(typed("entityType", "EntityType"), [mapping(QNAME)])).toBe(true);
      expect(javaCall(typed("entityType", "EntityType"), [mapping("MyModule.Customer")])).toBe(false);
    });

    it("detects a type parameter bound through an entity variable", () => {
      const mapping = (argument: string) => ({
        parameter: "Input",
        parameterValue: { $Type: "Microflows$BasicCodeActionParameterValue", argument },
      });
      const param = () => parameter("Order", objectType(QNAME));
      expect(javaCall(typed("typed", "Input"), [mapping(" $Order ")], [param()])).toBe(true);
      expect(javaCall(typed("typed", "Input"), [mapping("$Customer")], [param()])).toBe(false);
      expect(javaCall(typed("typed", "Input"), [mapping("$Order/Name")], [param()])).toBe(false);
    });

    it("ignores parameters of another type parameter or without a mapping", () => {
      const other: JavaActionSignature = { returnEntity: null, returnTypeParameter: "T", parameters: [{ name: "X", kind: "entityType", typeParameter: "U" }] };
      expect(javaCall(other, [{ parameter: "X", parameterValue: { $Type: "Microflows$EntityTypeCodeActionParameterValue", entity: QNAME } }])).toBe(false);
      expect(javaCall(typed("entityType", "EntityType"), [])).toBe(false);
    });
  });

  describe("rename registration", () => {
    it("skips a rename onto a name already declared in the flow", () => {
      const { helper } = detect([
        parameter("Order", objectType(QNAME)),
        activity(action("CreateVariableAction", { variableType: stringType(), variableName: "Purchase" })),
      ]);
      expect(helper.renames).toEqual([]);
      expect(helper.skippedRenames).toBe(1);
      expect(helper.declaredNames.has("Purchase")).toBe(true);
    });

    it("collects declared names from every declaring action", () => {
      const { helper } = detect([
        loop(iterableList("Iterator", "List"), [activity(action("CallExternalAction", { variableName: "External", parameterMappings: [] }))]),
        activity(action("RestCallAction", { resultHandling: { storeInVariable: false, outputVariableName: "RestOut" } })),
        activity(action("RestOperationCallAction", { operation: null, outputVariable: { variableName: "OpOut" } })),
        activity(action("ExportXmlAction", { outputMethod: { $Type: "Microflows$VariableExport", outputVariableName: "Xml" } })),
        activity(action("CommitAction", { outputVariableName: "" })),
      ]);
      expect([...helper.declaredNames].sort()).toEqual(["External", "Iterator", "OpOut", "RestOut", "Xml"]);
    });

    it("renames the same name declared twice", () => {
      const { helper } = detect([
        activity(action("CreateObjectAction", { entity: QNAME, outputVariableName: "NewOrder" })),
        activity(action("CreateObjectAction", { entity: QNAME, outputVariableName: "NewOrder" })),
      ]);
      expect(renamesOf(helper)).toEqual([
        ["NewOrder", "NewPurchase"],
        ["NewOrder", "NewPurchase"],
      ]);
      expect(helper.skippedRenames).toBe(0);
    });

    it("keeps entity variables without the old name in them", () => {
      const { helper } = detect([parameter("Customer2", objectType(QNAME))]);
      expect([...helper.entityVariables]).toEqual(["Customer2"]);
      expect(helper.renames).toEqual([]);
    });
  });
});

describe("reset", () => {
  it("clears the per-flow state", () => {
    const { helper } = detect([parameter("Order", objectType(QNAME)), activity(action("CreateVariableAction", { variableType: objectType(QNAME), variableName: "Purchase" }))]);
    expect(helper.skippedRenames).toBe(1);
    helper.reset();
    expect([helper.entityVariables.size, helper.declaredNames.size, helper.renames.length, helper.skippedRenames]).toEqual([0, 0, 0, 0]);
  });
});

describe("document level", () => {
  it("updateReturnVariableName renames an entity return variable name only", () => {
    const helper = newHelper();
    const entityFlow = microflow({ returnType: objectType(QNAME), returnVariableName: "Order" });
    expect(helper.updateReturnVariableName(entityFlow)).toBe(true);
    expect(entityFlow.returnVariableName).toBe("Purchase");
    expect(helper.updateReturnVariableName(entityFlow)).toBe(false);
    expect(helper.updateReturnVariableName(microflow({ returnType: stringType(), returnVariableName: "Order" }))).toBe(false);
  });

  it("usesEntity and shouldRenameDocument need the entity and the name", () => {
    const withParameter = detect([parameter("Order", objectType(QNAME))], undefined, { name: "ACT_Order" });
    expect(withParameter.helper.usesEntity(withParameter.flow)).toBe(true);
    expect(withParameter.helper.shouldRenameDocument(withParameter.flow)).toBe(true);

    const returnsEntity = detect([], undefined, { name: "GET_Order", returnType: listType(QNAME) });
    expect(returnsEntity.helper.shouldRenameDocument(returnsEntity.flow)).toBe(true);

    const unrelated = detect([], undefined, { name: "ACT_Order" });
    expect(unrelated.helper.usesEntity(unrelated.flow)).toBe(false);
    expect(unrelated.helper.shouldRenameDocument(unrelated.flow)).toBe(false);

    const otherName = detect([parameter("Order", objectType(QNAME))], undefined, { name: "ACT_Customer" });
    expect(otherName.helper.shouldRenameDocument(otherName.flow)).toBe(false);
  });
});

describe("UpdateValue and UpdateVariableName", () => {
  const helper = prepared();

  it.each([
    ["$Order", "$Purchase"],
    ["$Order/Name", "$Purchase/Name"],
    ["$Order/MyModule.Order_Customer", "$Purchase/MyModule.Order_Customer"],
    ["$Order != empty and $Order/Total > 0", "$Purchase != empty and $Purchase/Total > 0"],
    ["$OrderLine", "$OrderLine"],
    ["$order", "$order"],
    ["'$Order'", "'$Order'"],
    ["'it''s $Order' + $Order", "'it''s $Order' + $Purchase"],
    ["[id = $Order]", "[id = $Purchase]"],
    ["Order", "Order"],
  ])("UpdateValue(%s) -> %s", (value, expected) => {
    expect(helper.UpdateValue(value)).toBe(expected);
  });

  it("UpdateVariableName only replaces an exact match", () => {
    expect(helper.UpdateVariableName("Order")).toBe("Purchase");
    expect(helper.UpdateVariableName("OrderLine")).toBe("OrderLine");
    expect(helper.UpdateVariableName("$Order")).toBe("$Order");
    expect(helper.UpdateVariableName("order")).toBe("order");
  });
});

describe("updateObjectUsages", () => {
  // Every expression holds $Order and every bare variable name is Order; nothing else may contain "Order".
  const E = "$Order/Name";
  const B = "Order";
  const T = () => template(E, null);
  const R = () => customRange(E, E);
  const http = () => ({
    customLocation: E,
    customLocationTemplate: T(),
    httpAuthenticationUserName: E,
    authenticationPassword: E,
    headerEntries: [{ value: E }, { value: null }],
  });
  const proxy = () => ({ hostExpression: E, portExpression: E, usernameExpression: E, passwordExpression: E, useConfigurationExpression: E });
  const resultHandling = () => ({ outputVariableName: "Keep", importMappingCall: { mappingArgumentVariableName: B, range: R() } });
  const email = () => ({
    to: E,
    cc: E,
    bcc: E,
    subject: E,
    messageBodyHtml: E,
    messageBodyPlainText: E,
    subjectTemplate: T(),
    messageBodyHtmlTemplate: T(),
    messageBodyPlainTextTemplate: T(),
    attachment: B,
    customHeaders: [{ value: E }],
  });
  const listOperation = (type: string, props: object) => action("ListOperationAction", { operation: { $Type: `Microflows$${type}`, listVariableName: B, ...props }, outputVariableName: "Keep" });
  const restCall = (requestHandling: object) =>
    action("RestCallAction", { timeOutExpression: E, httpConfiguration: http(), proxyConfiguration: proxy(), requestHandling, resultHandling: resultHandling() });

  const actionCases: [string, Record<string, unknown>][] = [
    ["CreateObjectAction", action("CreateObjectAction", { items: [{ value: E }, { value: null }], outputVariableName: "Keep" })],
    ["ChangeObjectAction", action("ChangeObjectAction", { changeVariableName: B, items: [{ value: E }] })],
    ["RetrieveAction by association", action("RetrieveAction", { retrieveSource: { $Type: "Microflows$AssociationRetrieveSource", association: "M.Keep", startVariableName: B } })],
    ["RetrieveAction from database", action("RetrieveAction", { retrieveSource: { $Type: "Microflows$DatabaseRetrieveSource", xPathConstraint: `[id = ${E}]`, range: R() } })],
    ["AggregateListAction", action("AggregateListAction", { inputListVariableName: B, expression: E, reduceInitialValueExpression: E })],
    ["ApplyJumpToOptionAction", action("ApplyJumpToOptionAction", { workflowJumpToDetailsVariable: B })],
    ["CallExternalAction", action("CallExternalAction", { parameterMappings: [{ argument: E }, { argument: null }], variableName: "Keep" })],
    ["ChangeListAction", action("ChangeListAction", { changeVariableName: B, value: E })],
    ["ChangeVariableAction", action("ChangeVariableAction", { changeVariableName: B, value: E })],
    ["CloseFormAction", action("CloseFormAction", { numberOfPagesToClose: E })],
    ["CommitAction", action("CommitAction", { commitVariableName: B })],
    ["CounterMeterAction", action("CounterMeterAction", { name: E, value: E, tags: [{ key: E, value: E }] })],
    ["GaugeMeterAction", action("GaugeMeterAction", { name: E, value: E, tags: [{ key: E, value: E }] })],
    ["CreateVariableAction", action("CreateVariableAction", { initialValue: E, variableName: "Keep", variableType: stringType() })],
    ["DeleteAction", action("DeleteAction", { deleteVariableName: B })],
    ["DeleteExternalObject", action("DeleteExternalObject", { deleteVariableName: B })],
    ["DownloadFileAction", action("DownloadFileAction", { fileDocumentVariableName: B })],
    [
      "GenerateDocumentAction",
      action("GenerateDocumentAction", {
        fileVariableName: B,
        languageVariableName: B,
        parameterMappings: [{ argument: E }],
        marginBottomInInch: E,
        marginLeftInInch: E,
        marginRightInInch: E,
        marginTopInInch: E,
      }),
    ],
    ["GenerateJumpToOptionsAction", action("GenerateJumpToOptionsAction", { workflowVariable: B })],
    ["GetWorkflowActivityRecordsAction", action("GetWorkflowActivityRecordsAction", { workflowVariable: B })],
    ["GetWorkflowDataAction", action("GetWorkflowDataAction", { workflowVariable: B, workflow: "M.Keep", outputVariableName: "Keep" })],
    ["OpenWorkflowAction", action("OpenWorkflowAction", { workflowVariable: B })],
    ["NotifyWorkflowAction", action("NotifyWorkflowAction", { workflowVariable: B })],
    ["GetWorkflowsAction", action("GetWorkflowsAction", { workflowContextVariableName: B })],
    ["ImportXmlAction", action("ImportXmlAction", { xmlDocumentVariableName: B, resultHandling: resultHandling() })],
    ...(["JavaActionCallAction", "JavaScriptActionCallAction"] as const).map((type): [string, Record<string, unknown>] => [
      type,
      action(type, {
        parameterMappings: [
          { parameter: "M.Keep.Input", parameterValue: { $Type: "Microflows$BasicCodeActionParameterValue", argument: E } },
          { parameter: "M.Keep.Empty", parameterValue: { $Type: "Microflows$BasicCodeActionParameterValue", argument: null } },
          {
            parameter: "M.Keep.Text",
            parameterValue: {
              $Type: "Microflows$StringTemplateParameterValue",
              typedTemplate: {
                arguments: [
                  { $Type: "Microflows$PrimitiveTypedTemplateArgument", expression: E },
                  { $Type: "Microflows$PrimitiveTypedTemplateArgument", expression: null },
                ],
              },
            },
          },
          { parameter: "M.Keep.Entity", parameterValue: { $Type: "Microflows$EntityTypeCodeActionParameterValue", entity: "M.Keep" } },
        ],
      }),
    ]),
    ...["Contains", "Intersect", "ListEquals", "Subtract", "Union"].map((type): [string, Record<string, unknown>] => [
      `ListOperation ${type}`,
      listOperation(type, { secondListOrObjectVariableName: B }),
    ]),
    ...["FilterByExpression", "FindByExpression", "Filter", "Find"].map((type): [string, Record<string, unknown>] => [
      `ListOperation ${type}`,
      listOperation(type, { expression: E }),
    ]),
    ...["Head", "Tail", "Sort"].map((type): [string, Record<string, unknown>] => [`ListOperation ${type}`, listOperation(type, {})]),
    ["ListOperation ListRange", listOperation("ListRange", { customRange: R() })],
    ["LogMessageAction", action("LogMessageAction", { messageTemplate: T(), node: E })],
    ["IncrementCounterMeterAction", action("IncrementCounterMeterAction", { name: E, tags: [{ key: E, value: E }, { key: null, value: null }] })],
    ["MicroflowCallAction", action("MicroflowCallAction", { microflowCall: { microflow: "M.Keep", parameterMappings: [{ argument: E }, { argument: null }] } })],
    ["MLModelCallAction", action("MLModelCallAction", { inputVariableName: B, mlMappingDocument: "M.Keep" })],
    ["NanoflowCallAction", action("NanoflowCallAction", { nanoflowCall: { parameterMappings: [{ argument: E }] } })],
    ["OpenUserTaskAction", action("OpenUserTaskAction", { userTaskVariable: B })],
    ["PushToClientAction", action("PushToClientAction", { dataVariableName: B })],
    ["RestCallAction with custom request", restCall({ $Type: "Microflows$CustomRequestHandling", template: T() })],
    ["RestCallAction with mapping request", restCall({ $Type: "Microflows$MappingRequestHandling", mappingArgumentVariableName: B })],
    ["RestCallAction with binary request", restCall({ $Type: "Microflows$BinaryRequestHandling", expression: E })],
    [
      "RestCallAction with form data request",
      restCall({ $Type: "Microflows$FormDataRequestHandling", parts: [{ value: E, headerEntries: [{ value: E }] }, { value: null, headerEntries: [] }] }),
    ],
    ["RestCallAction with simple request", restCall({ $Type: "Microflows$SimpleRequestHandling", parameterMappings: [{ argument: E }, { argument: null }] })],
    [
      "RestCallAction with advanced request",
      restCall({ $Type: "Microflows$AdvancedRequestHandling", parameterMappings: [{ argument: E, mappingArgumentVariableName: B }] }),
    ],
    [
      "RestOperationCallAction",
      action("RestOperationCallAction", {
        operation: "M.Keep",
        outputVariable: null,
        baseUrlParameterMapping: { value: E },
        parameterMappings: [{ value: E }, { value: null }],
        queryParameterMappings: [{ value: E }],
        bodyVariable: { variableName: B },
      }),
    ],
    ["RollbackAction", action("RollbackAction", { rollbackVariableName: B })],
    [
      "SendEmailAction",
      action("SendEmailAction", {
        emailMessage: email(),
        testEmailMessage: email(),
        emailConnectionConfig: { host: E, port: E, emailId: E },
        emailAuthenticationConfig: { $Type: "Microflows$BasicAuthConfig", username: E, password: E },
      }),
    ],
    ["SendExternalObject", action("SendExternalObject", { variableNameToBeSent: B })],
    ["SetTaskOutcomeAction", action("SetTaskOutcomeAction", { workflowTaskVariable: B })],
    ["ShowMessageAction", action("ShowMessageAction", { template: T() })],
    ["ShowPageAction", action("ShowPageAction", { numberOfPagesToClose: E, pageSettings: { titleOverride: T(), parameterMappings: [{ argument: E }, { argument: null }] } })],
    ["SynchronizeAction", action("SynchronizeAction", { variableNames: [B, "Keep"] })],
    ["TransformJsonAction", action("TransformJsonAction", { inputVariableName: B })],
    ["ValidationFeedbackAction", action("ValidationFeedbackAction", { objectVariableName: B, feedbackTemplate: T() })],
    [
      "WebServiceCallAction",
      action("WebServiceCallAction", {
        timeOutExpression: E,
        httpConfiguration: http(),
        proxyConfiguration: proxy(),
        requestBodyHandling: { $Type: "Microflows$MappingRequestHandling", mappingArgumentVariableName: B },
        requestHeaderHandling: { $Type: "Microflows$SimpleRequestHandling", parameterMappings: [{ argument: E }] },
        resultHandling: resultHandling(),
      }),
    ],
    ["WorkflowCallAction", action("WorkflowCallAction", { workflowContextVariable: B, workflow: "M.Keep" })],
    ["WorkflowOperationAction abort", action("WorkflowOperationAction", { operation: { $Type: "Microflows$AbortOperation", workflowVariable: B, reason: T() } })],
    ["WorkflowOperationAction pause", action("WorkflowOperationAction", { operation: { $Type: "Microflows$PauseOperation", workflowVariable: B } })],
    [
      "ExportXmlAction to file document",
      action("ExportXmlAction", {
        resultHandling: { $Type: "Microflows$MappingRequestHandling", mappingArgumentVariableName: B },
        outputMethod: { $Type: "Microflows$FileDocumentExport", targetDocumentVariableName: B },
      }),
    ],
    ...["LockWorkflowAction", "UnlockWorkflowAction"].map((type): [string, Record<string, unknown>] => [
      type,
      action(type, { workflowSelection: { $Type: "Workflows$WorkflowDefinitionObjectSelection", workflowDefinitionVariable: B } }),
    ]),
  ];

  const objectCases: [string, Microflows.MicroflowObject][] = [
    ["ExclusiveSplit with expression", microflowObject("ExclusiveSplit", { splitCondition: { $Type: "Microflows$ExpressionSplitCondition", expression: E } })],
    [
      "ExclusiveSplit with rule",
      microflowObject("ExclusiveSplit", { splitCondition: { $Type: "Microflows$RuleSplitCondition", ruleCall: { parameterMappings: [{ argument: E }, { argument: null }] } } }),
    ],
    ["EndEvent", microflowObject("EndEvent", { returnValue: E })],
    ["InheritanceSplit", microflowObject("InheritanceSplit", { splitVariableName: B })],
    ["loop over a list, with its body", loop(iterableList("Keep", B), [activity(action("CommitAction", { commitVariableName: B }))])],
    ["while loop", loop({ $Type: "Microflows$WhileLoopCondition", whileExpression: E })],
    ["parameter default value", parameter("Keep", stringType(), { defaultValue: E })],
  ];

  const count = (text: string, word: string) => text.split(word).length - 1;

  function expectAllUpdated(object: Microflows.MicroflowObject): void {
    const before = JSON.stringify(object);
    prepared().updateObjectUsages([object]);
    const after = JSON.stringify(object);
    expect(count(before, "Order")).toBeGreaterThan(0);
    expect(after).not.toContain("Order");
    expect(count(after, "Purchase")).toBe(count(before, "Order"));
  }

  it.each(actionCases)("updates every usage in %s", (_, props) => {
    expectAllUpdated(activity(props));
  });

  it.each(objectCases)("updates every usage in %s", (_, object) => {
    expectAllUpdated(object);
  });

  it.each([
    ["CreateObjectAction", action("CreateObjectAction", { items: [{ value: null }] })],
    ["RetrieveAction", action("RetrieveAction", { retrieveSource: { $Type: "Microflows$DatabaseRetrieveSource", xPathConstraint: null, range: { $Type: "Microflows$ConstantRange" } } })],
    ["RetrieveAction other source", action("RetrieveAction", { retrieveSource: { $Type: "Microflows$Other" } })],
    ["AggregateListAction", action("AggregateListAction", { inputListVariableName: "Keep", expression: null, reduceInitialValueExpression: null })],
    ["CloseFormAction", action("CloseFormAction", { numberOfPagesToClose: null })],
    ["CounterMeterAction", action("CounterMeterAction", { name: null, value: null, tags: [{ key: null, value: null }] })],
    ["CreateVariableAction", action("CreateVariableAction", { initialValue: null })],
    ["GenerateDocumentAction", action("GenerateDocumentAction", { fileVariableName: "", languageVariableName: "", parameterMappings: [{ argument: null }], marginBottomInInch: null, marginLeftInInch: null, marginRightInInch: null, marginTopInInch: null })],
    ["ListOperation unknown", action("ListOperationAction", { operation: { $Type: "Microflows$Other" } })],
    ["LogMessageAction", action("LogMessageAction", { messageTemplate: template(null), node: null })],
    ["IncrementCounterMeterAction", action("IncrementCounterMeterAction", { name: null, tags: [] })],
    ["NanoflowCallAction", action("NanoflowCallAction", { nanoflowCall: { parameterMappings: [{ argument: null }] } })],
    [
      "RestCallAction",
      action("RestCallAction", {
        timeOutExpression: null,
        httpConfiguration: { customLocation: null, customLocationTemplate: null, httpAuthenticationUserName: null, authenticationPassword: null, headerEntries: [] },
        proxyConfiguration: null,
        requestHandling: { $Type: "Microflows$BinaryRequestHandling", expression: null },
        resultHandling: { importMappingCall: null },
      }),
    ],
    [
      "WebServiceCallAction",
      action("WebServiceCallAction", {
        timeOutExpression: null,
        httpConfiguration: { customLocation: null, customLocationTemplate: null, httpAuthenticationUserName: null, authenticationPassword: null, headerEntries: [] },
        proxyConfiguration: { hostExpression: null, portExpression: null, usernameExpression: null, passwordExpression: null, useConfigurationExpression: null },
        requestBodyHandling: { $Type: "Microflows$Other" },
        requestHeaderHandling: { $Type: "Microflows$Other" },
        resultHandling: { importMappingCall: null },
      }),
    ],
    ["RestOperationCallAction", action("RestOperationCallAction", { baseUrlParameterMapping: null, parameterMappings: [], queryParameterMappings: [{ value: null }], bodyVariable: null })],
    ["RestOperationCallAction empty base url", action("RestOperationCallAction", { baseUrlParameterMapping: { value: null }, parameterMappings: [], queryParameterMappings: [], bodyVariable: null })],
    [
      "SendEmailAction",
      action("SendEmailAction", {
        emailMessage: { to: null, cc: null, bcc: null, subject: null, messageBodyHtml: null, messageBodyPlainText: null, subjectTemplate: template(), messageBodyHtmlTemplate: template(), messageBodyPlainTextTemplate: template(), attachment: "", customHeaders: [] },
        testEmailMessage: { to: null, cc: null, bcc: null, subject: null, messageBodyHtml: null, messageBodyPlainText: null, subjectTemplate: template(), messageBodyHtmlTemplate: template(), messageBodyPlainTextTemplate: template(), attachment: "", customHeaders: [] },
        emailConnectionConfig: { host: null, port: null, emailId: null },
        emailAuthenticationConfig: null,
      }),
    ],
    ["SendEmailAction document auth", action("SendEmailAction", {
      emailMessage: { to: null, cc: null, bcc: null, subject: null, messageBodyHtml: null, messageBodyPlainText: null, subjectTemplate: template(), messageBodyHtmlTemplate: template(), messageBodyPlainTextTemplate: template(), attachment: "", customHeaders: [] },
      testEmailMessage: { to: null, cc: null, bcc: null, subject: null, messageBodyHtml: null, messageBodyPlainText: null, subjectTemplate: template(), messageBodyHtmlTemplate: template(), messageBodyPlainTextTemplate: template(), attachment: "", customHeaders: [] },
      emailConnectionConfig: { host: null, port: null, emailId: null },
      emailAuthenticationConfig: { $Type: "Microflows$AuthenticationDocumentConfig", username: "$Order", password: null },
    })],
    ["ShowPageAction", action("ShowPageAction", { numberOfPagesToClose: null, pageSettings: { titleOverride: null, parameterMappings: [] } })],
    ["ExportXmlAction to variable", action("ExportXmlAction", { resultHandling: { $Type: "Microflows$Other" }, outputMethod: { $Type: "Microflows$VariableExport", outputVariableName: "Order" } })],
    ["LockWorkflowAction by name", action("LockWorkflowAction", { workflowSelection: { $Type: "Workflows$WorkflowDefinitionNameSelection", workflow: "Order" } })],
    ["UnlockWorkflowAction without selection", action("UnlockWorkflowAction", { workflowSelection: null })],
    ...["CancelSynchronizationAction", "CastAction", "ClearFromClientAction", "CreateListAction", "ShowHomePageAction", "UnknownAction"].map(
      (type): [string, Record<string, unknown>] => [type, action(type, { outputVariableName: "Order" })],
    ),
  ])("leaves %s alone when there is nothing to update", (_, props) => {
    const object = activity(props);
    const before = JSON.stringify(object);
    prepared().updateObjectUsages([object]);
    expect(JSON.stringify(object)).toBe(before);
  });

  it.each([
    ["activity without action", activity(null)],
    ["split with null expression", microflowObject("ExclusiveSplit", { splitCondition: { $Type: "Microflows$ExpressionSplitCondition", expression: null } })],
    ["split with other condition", microflowObject("ExclusiveSplit", { splitCondition: { $Type: "Microflows$Other" } })],
    ["end event without value", microflowObject("EndEvent", { returnValue: null })],
    ["while loop without expression", loop({ $Type: "Microflows$WhileLoopCondition", whileExpression: null })],
    ["parameter without default", parameter("Order", stringType())],
    ["annotation", microflowObject("Annotation", { caption: "$Order" })],
  ])("leaves %s alone", (_, object) => {
    const before = JSON.stringify(object);
    prepared().updateObjectUsages([object]);
    expect(JSON.stringify(object)).toBe(before);
  });
});
