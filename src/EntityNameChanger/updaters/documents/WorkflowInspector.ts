import type { Workflows } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { workflowContextEntity } from "../microflows/ReferenceCache";
import { walkElements } from "../shared/elementWalker";
import { rewriteExpression } from "../shared/variableRewrite";
import { type DocumentInspector, type LocalRenames, NO_LOCAL_RENAMES } from "./DocumentUpdater";

// Properties holding an expression or XPath on any workflow element; `$Param` tokens are rewritten.
const EXPRESSION_PROPERTIES = ["expression", "dueDate", "delay", "firstExecutionTime", "xPathConstraint"] as const;

// String templates with display text; their `text` gets the entity name replaced.
const TEMPLATE_PROPERTIES = ["workflowName", "workflowDescription", "taskName", "taskDescription"] as const;

// Workflows: the context parameter (when of the entity's type and named after it), its usages, and the display texts.
export class WorkflowInspector implements DocumentInspector<Workflows.Workflow> {
  private readonly context: RenameContext;
  private readonly naming: NamingPolicy;

  constructor(context: RenameContext, naming: NamingPolicy) {
    this.context = context;
    this.naming = naming;
  }

  usesEntity(workflow: Workflows.Workflow): boolean {
    return isEntityQname(workflowContextEntity(workflow), this.context);
  }

  // apply also renames the entity name in display texts of a workflow of the entity.
  changesBeyondRenames(workflow: Workflows.Workflow): boolean {
    return this.usesEntity(workflow);
  }

  // UNVERIFIED: whether Studio Pro allows renaming the parameter (default WorkflowContext).
  planLocalRenames(workflow: Workflows.Workflow): LocalRenames {
    const parameter = workflow.parameter;
    if (parameter === null || parameter === undefined || !this.usesEntity(workflow)) {
      return NO_LOCAL_RENAMES;
    }
    const newName = this.naming.rename(parameter.name);
    if (newName === parameter.name) {
      console.debug(`workflow ${workflow.name}: parameter '${parameter.name}' keeps its name`);
      return NO_LOCAL_RENAMES;
    }
    console.debug(`workflow ${workflow.name}: rename parameter '${parameter.name}' -> '${newName}'`);
    return { renames: new Map([[parameter.name, newName]]), referencedByCallers: true };
  }

  apply(workflow: Workflows.Workflow, local: LocalRenames): number {
    if (!this.usesEntity(workflow)) {
      return 0;
    }
    let changes = 0;
    const parameter = workflow.parameter;
    const newName = parameter === null || parameter === undefined ? undefined : local.renames.get(parameter.name);
    if (parameter && newName !== undefined) {
      console.debug(`applying parameter rename '${parameter.name}' -> '${newName}'`);
      parameter.name = newName;
      changes++;
    }
    changes += this.renameText(workflow, "title");
    walkElements(workflow, (element) => {
      if (local.renames.size > 0) {
        for (const property of EXPRESSION_PROPERTIES) {
          const value = element[property];
          if (typeof value === "string") {
            const rewritten = rewriteExpression(value, local.renames);
            if (rewritten !== value) {
              element[property] = rewritten;
              changes++;
            }
          }
        }
      }
      changes += this.renameText(element, "caption");
      for (const property of TEMPLATE_PROPERTIES) {
        const template = element[property];
        if (typeof template === "object" && template !== null) {
          changes += this.renameText(template as Record<string, unknown>, "text");
        }
      }
    });
    console.debug(`workflow ${workflow.name}: ${changes} changes`);
    return changes;
  }

  // Display text only: the entity name is replaced like in names.
  private renameText(owner: object, property: string): number {
    const record = owner as Record<string, unknown>;
    const value = record[property];
    if (typeof value !== "string") {
      return 0;
    }
    const newValue = this.naming.rename(value);
    if (newValue === value) {
      return 0;
    }
    console.debug(`updated ${property} '${value}' to '${newValue}'`);
    record[property] = newValue;
    return 1;
  }
}
