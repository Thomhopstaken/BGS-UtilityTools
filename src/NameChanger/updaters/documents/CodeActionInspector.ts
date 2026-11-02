import type { CodeActions, JavaActions, JavaScriptActions, Primitives } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { entityOfCodeActionType } from "../microflows/ReferenceCache";
import { applyNamedRenames, type DocumentInspector, type LocalRenames, planNamedRenames } from "./DocumentUpdater";

export type CodeActionDocument = JavaActions.JavaAction | JavaScriptActions.JavaScriptAction;

// Java and JavaScript actions: renamed when the return type or a parameter is of the entity's type. Parameters of
// the entity's type named after it are renamed too; callers map them as Module.Action.Parameter. Their code is not
// updated (javasource/javascriptsource), the run log warns instead.
export class CodeActionInspector implements DocumentInspector<CodeActionDocument> {
  private readonly context: RenameContext;
  private readonly naming: NamingPolicy;

  constructor(context: RenameContext, naming: NamingPolicy) {
    this.context = context;
    this.naming = naming;
  }

  usesEntity(action: CodeActionDocument, _info?: Readonly<Primitives.UnitInfo>): boolean {
    const found =
      this.isEntity(entityOfCodeActionType(action.actionReturnType)) ||
      action.actionParameters.some((parameter) => this.isEntityParameter(parameter));
    console.debug(`${action.$Type} ${action.name}: uses entity=${found}`);
    return found;
  }

  // UNVERIFIED: callers' parameter mappings are Module.Action.Parameter (a bare name is not rewritten).
  planLocalRenames(action: CodeActionDocument): LocalRenames {
    return planNamedRenames(
      `${action.$Type} ${action.name}`,
      action.actionParameters,
      (parameter) => this.isEntityParameter(parameter),
      this.naming,
      true,
    );
  }

  apply(action: CodeActionDocument, local: LocalRenames): number {
    const changes = applyNamedRenames(action.actionParameters, local);
    console.debug(`${action.$Type} ${action.name}: ${changes} parameters renamed`);
    return changes;
  }

  private isEntityParameter(parameter: CodeActions.CodeActionParameter): boolean {
    const type = parameter.actionParameterType;
    return type.$Type === "CodeActions$BasicParameterType" && this.isEntity(entityOfCodeActionType(type.type));
  }

  private isEntity(qname: string | null | undefined): boolean {
    return isEntityQname(qname, this.context);
  }
}
