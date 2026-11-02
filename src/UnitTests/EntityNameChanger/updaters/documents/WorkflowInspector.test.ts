import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { NO_LOCAL_RENAMES } from "../../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import { WorkflowInspector } from "../../../../EntityNameChanger/updaters/documents/WorkflowInspector";
import { stringTemplate, workflow, workflowActivity } from "../../helpers/documentBuilders";
import { fakeContext } from "../../helpers/fakes";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
const inspector = new WorkflowInspector(context, new NamingPolicy(context.oldName, context.newName, context.protectedNames));

describe("WorkflowInspector.usesEntity", () => {
  it("is true for the entity as context parameter, old or new name", () => {
    expect(inspector.usesEntity(workflow({ entity: "MyModule.Order" }))).toBe(true);
    expect(inspector.usesEntity(workflow({ entity: "MyModule.Purchase" }))).toBe(true);
  });

  it("is false for another entity or no parameter", () => {
    expect(inspector.usesEntity(workflow({ entity: "MyModule.OrderLine" }))).toBe(false);
    expect(inspector.usesEntity(workflow({ entity: null }))).toBe(false);
  });
});

describe("WorkflowInspector.planLocalRenames", () => {
  it("renames a parameter named after the entity, for callers too", () => {
    expect(inspector.planLocalRenames(workflow({ parameterName: "Order" }))).toEqual({
      renames: new Map([["Order", "Purchase"]]),
      referencedByCallers: true,
    });
  });

  it("keeps WorkflowContext and parameters of another entity", () => {
    expect(inspector.planLocalRenames(workflow())).toBe(NO_LOCAL_RENAMES);
    expect(inspector.planLocalRenames(workflow({ entity: "MyModule.Customer", parameterName: "Order" }))).toBe(NO_LOCAL_RENAMES);
    expect(inspector.planLocalRenames(workflow({ entity: null }))).toBe(NO_LOCAL_RENAMES);
  });
});

describe("WorkflowInspector.apply", () => {
  it("renames the parameter and rewrites its usages", () => {
    const split = workflowActivity("ExclusiveSplitActivity", { expression: "$Order/Total > 0 and $OrderLine != empty" });
    const timer = workflowActivity("WaitForTimerActivity", { delay: "addDays($Order/Date, 1)" });
    const task = workflowActivity("SingleUserTaskActivity", {
      dueDate: "$Order/Due",
      userTargeting: { $Type: "Workflows$XPathUserTargeting", xPathConstraint: "[Name = $Order/Owner]" },
      taskName: stringTemplate("Check {1}", "$Order/Number"),
      taskDescription: stringTemplate(""),
    });
    const call = workflowActivity("CallMicroflowActivity", {
      parameterMappings: [{ $Type: "Workflows$MicroflowCallParameterMapping", parameter: "MyModule.Sub.Order", expression: "$Order" }],
    });
    const wf = workflow({ parameterName: "Order", activities: [split, timer, task, call] });
    const local = inspector.planLocalRenames(wf);
    expect(inspector.apply(wf, local)).toBeGreaterThanOrEqual(7);
    expect(wf.parameter.name).toBe("Purchase");
    expect(split.expression).toBe("$Purchase/Total > 0 and $OrderLine != empty");
    expect(timer.delay).toBe("addDays($Purchase/Date, 1)");
    expect(task.dueDate).toBe("$Purchase/Due");
    expect((task.userTargeting as { xPathConstraint: string }).xPathConstraint).toBe("[Name = $Purchase/Owner]");
    expect((task.taskName as { arguments: { expression: string }[] }).arguments[0].expression).toBe("$Purchase/Number");
    expect((call.parameterMappings as { parameter: string; expression: string }[])[0]).toEqual({
      $Type: "Workflows$MicroflowCallParameterMapping",
      parameter: "MyModule.Sub.Order",
      expression: "$Purchase",
    });
  });

  it("replaces the entity name in the display texts, protected names excluded", () => {
    const task = workflowActivity("SingleUserTaskActivity", {
      caption: "Review Order",
      taskName: stringTemplate("Check Order and OrderLine"),
      taskDescription: stringTemplate("Order {1}", "$WorkflowContext/Number"),
    });
    const wf = workflow({ title: "Approve Order", workflowName: stringTemplate("Order approval"), activities: [task] });
    expect(inspector.apply(wf, NO_LOCAL_RENAMES)).toBe(5);
    expect(wf.title).toBe("Approve Purchase");
    expect((wf.workflowName as unknown as { text: string }).text).toBe("Purchase approval");
    expect(task.caption).toBe("Review Purchase");
    expect((task.taskName as { text: string }).text).toBe("Check Purchase and OrderLine");
    expect((task.taskDescription as { text: string; arguments: { expression: string }[] }).text).toBe("Purchase {1}");
    expect((task.taskDescription as { arguments: { expression: string }[] }).arguments[0].expression).toBe("$WorkflowContext/Number");
    expect(wf.parameter.name).toBe("WorkflowContext");
  });

  it("changes nothing in a workflow of another entity", () => {
    const wf = workflow({ entity: "MyModule.Customer", title: "Order follow-up", parameterName: "Order" });
    expect(inspector.apply(wf, { renames: new Map([["Order", "Purchase"]]), referencedByCallers: true })).toBe(0);
    expect(wf.title).toBe("Order follow-up");
    expect(wf.parameter.name).toBe("Order");
  });
});
