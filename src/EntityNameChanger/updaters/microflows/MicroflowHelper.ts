import type { ConnectorKit, DatabaseConnector, DataTypes, ExcelDataImporter, Microflows } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { type RenameMap, rewriteExpression, rewriteName } from "../shared/variableRewrite";
import {
  emptyFlowReferences,
  entityOfDataType,
  type FlowReferences,
  type JavaActionSignature,
  type ReferenceCache,
} from "./ReferenceCache";

// Detection repeats until the set of entity variables is stable; this caps it for pathological flows.
const MAX_DETECTION_PASSES = 10;

// An entity-typed variable found in the flow; apply writes a new name to the property that declares it.
type Candidate = { name: string; target: object; apply: (name: string) => void };

// A named parameter in a flow's parameters list (microflow and rule parameters).
type NamedParameter = { name: string };

// Java and JavaScript action parameter mappings have the same shape.
type CodeActionParameterMapping = Microflows.JavaActionParameterMapping | Microflows.JavaScriptActionParameterMapping;

// Actions of the Database Connector, Excel importer and ConnectorKit; not in the Microflows.MicroflowAction union.
type ModuleAction =
  | DatabaseConnector.ExecuteDatabaseQueryAction
  | ExcelDataImporter.ImportExcelDataAction
  | ConnectorKit.ConnectorActionCallAction;

const MODULE_ACTION_TYPES: ReadonlySet<string> = new Set([
  "DatabaseConnector$ExecuteDatabaseQueryAction",
  "ExcelDataImporter$ImportExcelDataAction",
  "ConnectorKit$ConnectorActionCallAction",
]);

// UNVERIFIED: these actions show up as ActionActivity.action at runtime.
function asModuleAction(action: Microflows.MicroflowAction): ModuleAction | null {
  return MODULE_ACTION_TYPES.has((action as { $Type: string }).$Type) ? (action as unknown as ModuleAction) : null;
}

export class MicroflowHelper {
  readonly entityId: string;
  readonly entityQname: string;
  readonly context: RenameContext;
  readonly naming: NamingPolicy;
  // Shared for the whole job; filled by ReferenceResolver.
  readonly references: ReferenceCache;
  // Per-flow state, cleared by reset().
  readonly entityVariables = new Set<string>();
  readonly declaredNames = new Set<string>();
  readonly renames: VariableRename[] = [];
  skippedRenames = 0;
  private candidates: Candidate[] = [];
  private flowParameters: NamedParameter[] = [];

  constructor(context: RenameContext, naming: NamingPolicy, references: ReferenceCache) {
    this.entityId = context.entityId;
    this.entityQname = context.oldQualifiedName;
    this.context = context;
    this.naming = naming;
    this.references = references;
    console.info(`MicroflowHelper for ${this.entityQname} (${this.entityId}) -> ${context.newName}`);
  }

  reset(): void {
    this.entityVariables.clear();
    this.declaredNames.clear();
    this.renames.length = 0;
    this.candidates = [];
    this.flowParameters = [];
    this.skippedRenames = 0;
    console.debug("MicroflowHelper state reset");
  }

  //-------------------references to resolve before detection----------------------------//
  collectReferences(objects: Microflows.MicroflowObject[], refs?: FlowReferences): FlowReferences {
    const result = refs ?? emptyFlowReferences();
    for (const obj of objects) {
      if (obj.$Type === "Microflows$LoopedActivity") {
        this.collectReferences(obj.objectCollection.objects, result);
        continue;
      }
      if (obj.$Type !== "Microflows$ActionActivity" || obj.action === null) {
        continue;
      }
      const action = obj.action;
      const moduleAction = asModuleAction(action);
      if (moduleAction !== null) {
        collectModuleActionReference(moduleAction, result);
        continue;
      }
      switch (action.$Type) {
        case "Microflows$RetrieveAction":
          if (
            action.retrieveSource.$Type === "Microflows$AssociationRetrieveSource" &&
            action.retrieveSource.association !== null
          ) {
            result.associations.add(action.retrieveSource.association);
          }
          break;
        case "Microflows$MicroflowCallAction":
          if (action.useReturnVariable && action.microflowCall.microflow !== null) {
            result.microflows.add(action.microflowCall.microflow);
          }
          break;
        case "Microflows$JavaActionCallAction":
          if (action.useReturnVariable && action.javaAction !== null) {
            result.javaActions.add(action.javaAction);
          }
          break;
        case "Microflows$NanoflowCallAction":
          if (action.useReturnVariable && action.nanoflowCall.nanoflow !== null) {
            result.nanoflows.add(action.nanoflowCall.nanoflow);
          }
          break;
        case "Microflows$JavaScriptActionCallAction":
          if (action.useReturnVariable && action.javaScriptAction !== null) {
            result.javaScriptActions.add(action.javaScriptAction);
          }
          break;
        case "Microflows$GetWorkflowDataAction":
          if (action.workflow !== null) {
            result.workflows.add(action.workflow);
          }
          break;
        case "Microflows$RestOperationCallAction":
          if (action.operation !== null && action.outputVariable !== null) {
            result.restOperations.add(action.operation);
          }
          break;
        case "Microflows$MLModelCallAction":
          if (action.mlMappingDocument !== null) {
            result.mlMappings.add(action.mlMappingDocument);
          }
          break;
        default:
          break;
      }
    }
    return result;
  }

  //-------------------finding variables that use the entity----------------------------//
  // Objects are stored in creation order, not flow order, so detection repeats until nothing new is found.
  // Takes MicroflowBase so nanoflows and rules can reuse detection later.
  detectEntityVariables(flow: Microflows.MicroflowBase): void {
    const objects = flow.objectCollection.objects;
    // Nanoflows only hold parameters in their object collection; rules may lack the list at runtime.
    this.flowParameters = ("parameters" in flow ? flow.parameters : undefined) ?? [];
    const sequenceFlows = flow.flows.filter(
      (f): f is Microflows.SequenceFlow => f.$Type === "Microflows$SequenceFlow",
    );
    const objectsById = new Map<string, Microflows.MicroflowObject>();
    this.indexObjects(objects, objectsById);
    this.collectDeclaredNames(objects);
    let previous: string | null = null;
    for (let pass = 1; pass <= MAX_DETECTION_PASSES; pass++) {
      this.candidates = [];
      const found = new Set<string>();
      this.detectInObjects(objects, sequenceFlows, objectsById, found);
      const signature = [...found].sort().join(",");
      console.debug(`detection pass ${pass} in ${flow.name}: [${signature}]`);
      this.entityVariables.clear();
      found.forEach((name) => this.entityVariables.add(name));
      if (signature === previous) {
        break;
      }
      previous = signature;
      if (pass === MAX_DETECTION_PASSES) {
        console.info(`detection in ${flow.name} did not stabilise after ${pass} passes`);
      }
    }
    this.registerRenames();
  }

  private detectInObjects(
    objects: Microflows.MicroflowObject[],
    sequenceFlows: Microflows.SequenceFlow[],
    objectsById: Map<string, Microflows.MicroflowObject>,
    found: Set<string>,
  ): void {
    for (const obj of objects) {
      switch (obj.$Type) {
        case "Microflows$MicroflowParameterObject":
          // Callers' parameter mappings are updated by the reference pass (see parameterRenames).
          if (this.isEntityType(obj.variableType)) {
            console.debug(
              `parameter ${obj.name} is of type ${this.entityQname} (hasVariableNameBeenChanged=${obj.hasVariableNameBeenChanged})`,
            );
            this.addCandidate(found, obj.name, obj, (name) => this.renameParameter(obj, name));
          }
          break;
        case "Microflows$LoopedActivity": {
          const source = obj.loopSource;
          // The iterator of a loop over an entity list is an entity object.
          if (source.$Type === "Microflows$IterableList" && this.entityVariables.has(source.listVariableName)) {
            console.debug(`loop iterator ${source.variableName} over ${source.listVariableName}`);
            this.addCandidate(found, source.variableName, source, (name) => (source.variableName = name));
          }
          this.detectInObjects(obj.objectCollection.objects, sequenceFlows, objectsById, found);
          break;
        }
        case "Microflows$ActionActivity":
          if (obj.action !== null) {
            this.detectInAction(obj, obj.action, sequenceFlows, objectsById, found);
          }
          break;
        default:
          break;
      }
    }
  }

  private detectInAction(
    activity: Microflows.ActionActivity,
    action: Microflows.MicroflowAction,
    sequenceFlows: Microflows.SequenceFlow[],
    objectsById: Map<string, Microflows.MicroflowObject>,
    found: Set<string>,
  ): void {
    const moduleAction = asModuleAction(action);
    if (moduleAction !== null) {
      if (this.isEntityQname(this.moduleActionEntity(moduleAction))) {
        console.debug(`${moduleAction.$Type} output ${moduleAction.outputVariableName} is of type ${this.entityQname}`);
        this.addOutput(found, moduleAction);
      }
      return;
    }
    switch (action.$Type) {
      case "Microflows$CreateObjectAction":
      case "Microflows$CreateListAction":
        if (this.isEntityQname(action.entity)) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$RetrieveAction":
        if (this.isRetrieveOfEntity(action)) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$CreateVariableAction":
        if (this.isEntityType(action.variableType)) {
          this.addCandidate(found, action.variableName, action, (name) => (action.variableName = name));
        }
        break;
      case "Microflows$MicroflowCallAction":
        if (
          action.useReturnVariable &&
          this.returnsEntity(action.microflowCall.microflow, this.references.microflowReturnEntities)
        ) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$NanoflowCallAction":
        if (
          action.useReturnVariable &&
          this.returnsEntity(action.nanoflowCall.nanoflow, this.references.nanoflowReturnEntities)
        ) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$ListOperationAction": {
        const operation = action.operation;
        // Contains and ListEquals return a Boolean, not an entity object or list.
        if (operation.$Type === "Microflows$Contains" || operation.$Type === "Microflows$ListEquals") {
          break;
        }
        if (this.entityVariables.has(operation.listVariableName)) {
          this.addOutput(found, action);
        }
        break;
      }
      case "Microflows$CastAction":
        if (this.isCastToEntity(activity.$ID, sequenceFlows, objectsById)) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$JavaActionCallAction":
        if (this.codeActionReturnsEntity(action, action.javaAction, this.references.javaActions)) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$JavaScriptActionCallAction":
        if (this.codeActionReturnsEntity(action, action.javaScriptAction, this.references.javaScriptActions)) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$RestCallAction":
      case "Microflows$WebServiceCallAction":
      case "Microflows$ImportXmlAction": {
        const resultHandling = action.resultHandling;
        if (resultHandling.storeInVariable && this.isEntityType(resultHandling.variableType)) {
          this.addCandidate(
            found,
            resultHandling.outputVariableName,
            resultHandling,
            (name) => (resultHandling.outputVariableName = name),
          );
        }
        break;
      }
      case "Microflows$CallExternalAction":
        if (this.isEntityType(action.variableDataType)) {
          this.addCandidate(found, action.variableName, action, (name) => (action.variableName = name));
        }
        break;
      case "Microflows$GetWorkflowDataAction":
        // The workflow data object is the workflow's context parameter.
        if (action.workflow !== null && this.isEntityQname(this.references.workflowContextEntities.get(action.workflow))) {
          this.addOutput(found, action);
        }
        break;
      case "Microflows$RestOperationCallAction": {
        const outputVariable = action.outputVariable;
        if (
          outputVariable !== null &&
          action.operation !== null &&
          this.isEntityQname(this.references.restOperationEntities.get(action.operation))
        ) {
          this.addCandidate(
            found,
            outputVariable.variableName,
            outputVariable,
            (name) => (outputVariable.variableName = name),
          );
        }
        break;
      }
      case "Microflows$MLModelCallAction":
        if (
          action.mlMappingDocument !== null &&
          this.isEntityQname(this.references.mlOutputEntities.get(action.mlMappingDocument))
        ) {
          this.addOutput(found, action);
        }
        break;
      default:
        break;
    }
  }

  // Association retrieves return the other end; only rename when that end is the entity.
  private isRetrieveOfEntity(action: Microflows.RetrieveAction): boolean {
    const retrieve = action.retrieveSource;
    switch (retrieve.$Type) {
      case "Microflows$DatabaseRetrieveSource":
        return this.isEntityQname(retrieve.entity);
      case "Microflows$AssociationRetrieveSource": {
        if (retrieve.association === null) {
          return false;
        }
        const ends = this.references.associations.get(retrieve.association);
        if (ends === undefined || ends === null) {
          console.debug(`association ${retrieve.association} not resolved`);
          return false;
        }
        // UNVERIFIED: parent/child may be an $ID or a qualified name, so both are checked.
        const parentIsEntity = this.isEntityRef(ends.parent);
        const childIsEntity = this.isEntityRef(ends.child);
        console.debug(
          `association ${retrieve.association}: parent=${ends.parent} (${parentIsEntity}), child=${ends.child} (${childIsEntity}), start=${retrieve.startVariableName}`,
        );
        if (parentIsEntity && childIsEntity) {
          return true;
        }
        if (!parentIsEntity && !childIsEntity) {
          return false;
        }
        return !this.entityVariables.has(retrieve.startVariableName);
      }
      default:
        return false;
    }
  }

  // Walks back from the cast to the inheritance split(s); every path must come from the entity's case.
  // UNVERIFIED: flow origin/destination are object $IDs and flow.flows also holds the flows inside loops.
  private isCastToEntity(
    activityId: string,
    sequenceFlows: Microflows.SequenceFlow[],
    objectsById: Map<string, Microflows.MicroflowObject>,
  ): boolean {
    const visited = new Set<string>();
    const stack = [activityId];
    let foundSplit = false;
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      for (const flow of sequenceFlows.filter((f) => f.destination === id)) {
        const origin = objectsById.get(flow.origin);
        if (origin === undefined) {
          console.debug(`cast path: origin ${flow.origin} not found`);
          continue;
        }
        if (origin.$Type !== "Microflows$InheritanceSplit") {
          stack.push(origin.$ID);
          continue;
        }
        const inheritanceCase = flow.caseValues.find(
          (c): c is Microflows.InheritanceCase => c.$Type === "Microflows$InheritanceCase",
        );
        console.debug(`cast path reaches split on ${origin.splitVariableName} with case ${inheritanceCase?.value}`);
        if (!this.isEntityQname(inheritanceCase?.value)) {
          return false;
        }
        foundSplit = true;
      }
    }
    return foundSplit;
  }

  // Return entity of a called microflow or nanoflow, from the cache filled by ReferenceResolver.
  private returnsEntity(called: string | null, returnEntities: ReadonlyMap<string, string | null>): boolean {
    if (called === null) {
      return false;
    }
    const returnEntity = returnEntities.get(called);
    if (returnEntity === undefined) {
      console.debug(`return type of ${called} not resolved`);
      return false;
    }
    return this.isEntityQname(returnEntity);
  }

  // Java and JavaScript actions: a concrete return entity, or a type parameter bound by the arguments.
  private codeActionReturnsEntity(
    action: { useReturnVariable: boolean; parameterMappings: CodeActionParameterMapping[] },
    codeAction: string | null,
    signatures: ReadonlyMap<string, JavaActionSignature | null>,
  ): boolean {
    if (!action.useReturnVariable || codeAction === null) {
      return false;
    }
    const signature = signatures.get(codeAction);
    if (signature === undefined || signature === null) {
      console.debug(`code action ${codeAction} not resolved`);
      return false;
    }
    if (signature.returnEntity !== null) {
      return this.isEntityQname(signature.returnEntity);
    }
    if (signature.returnTypeParameter !== null) {
      return this.typeParameterIsEntity(signature, action.parameterMappings, signature.returnTypeParameter);
    }
    return false;
  }

  // A type parameter is bound by an entity-type argument, or by an object/list argument of that type.
  // UNVERIFIED: mapping.parameter is assumed to be the parameter name or end with ".<name>".
  private typeParameterIsEntity(
    signature: JavaActionSignature,
    mappings: CodeActionParameterMapping[],
    typeParameter: string,
  ): boolean {
    for (const parameter of signature.parameters) {
      if (parameter.typeParameter !== typeParameter) {
        continue;
      }
      const mapping = mappings.find(
        (m) => m.parameter === parameter.name || m.parameter.endsWith(`.${parameter.name}`),
      );
      if (mapping === undefined) {
        continue;
      }
      const value = mapping.parameterValue;
      if (parameter.kind === "entityType" && value.$Type === "Microflows$EntityTypeCodeActionParameterValue") {
        console.debug(`type parameter ${typeParameter} bound to ${value.entity}`);
        return this.isEntityQname(value.entity);
      }
      if (
        parameter.kind === "typed" &&
        value.$Type === "Microflows$BasicCodeActionParameterValue" &&
        value.argument !== null
      ) {
        const variable = value.argument.trim().match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
        if (variable !== null && this.entityVariables.has(variable[1])) {
          console.debug(`type parameter ${typeParameter} bound through $${variable[1]}`);
          return true;
        }
      }
    }
    return false;
  }

  private isEntityType(dataType: DataTypes.DataType | null | undefined): boolean {
    return this.isEntityQname(entityOfDataType(dataType));
  }

  private isEntityQname(qname: string | null | undefined): boolean {
    return isEntityQname(qname, this.context);
  }

  private isEntityRef(ref: string): boolean {
    return ref === this.entityId || this.isEntityQname(ref);
  }

  // Renames the parameter object and the matching entry in the flow's parameters list.
  // UNVERIFIED: which of the two Studio Pro treats as leading, so both are kept in sync.
  private renameParameter(parameter: Microflows.MicroflowParameterObject, name: string): void {
    const oldName = parameter.name;
    parameter.name = name;
    const listed = this.flowParameters.find((p) => p.name === oldName);
    if (listed !== undefined) {
      listed.name = name;
    } else if (this.flowParameters.length > 0) {
      console.debug(`parameter ${oldName} not found in the flow's parameters list`);
    }
  }

  private addOutput(found: Set<string>, action: { outputVariableName: string }): void {
    this.addCandidate(found, action.outputVariableName, action, (name) => (action.outputVariableName = name));
  }

  private addCandidate(found: Set<string>, name: string, target: object, apply: (name: string) => void): void {
    if (name.length === 0) {
      return;
    }
    found.add(name);
    if (!this.candidates.some((c) => c.target === target)) {
      this.candidates.push({ name, target, apply });
    }
  }

  // Turns the final candidates into renames, skipping names that would clash in this flow.
  private registerRenames(): void {
    for (const candidate of this.candidates) {
      const newName = this.naming.rename(candidate.name);
      if (newName === candidate.name) {
        continue;
      }
      if (this.renames.some((r) => r.target === candidate.target)) {
        continue;
      }
      const clash =
        this.declaredNames.has(newName) ||
        this.renames.some((r) => r.newName === newName && r.oldName !== candidate.name);
      if (clash) {
        console.info(`skipped rename '${candidate.name}' -> '${newName}': name already in use`);
        this.skippedRenames++;
        continue;
      }
      console.debug(`rename '${candidate.name}' -> '${newName}'`);
      this.renames.push(new VariableRename(candidate.name, newName, candidate.target, candidate.apply));
    }
  }

  private indexObjects(objects: Microflows.MicroflowObject[], objectsById: Map<string, Microflows.MicroflowObject>) {
    for (const obj of objects) {
      objectsById.set(obj.$ID, obj);
      if (obj.$Type === "Microflows$LoopedActivity") {
        this.indexObjects(obj.objectCollection.objects, objectsById);
      }
    }
  }

  // Every variable declared in the flow, used to prevent a rename onto an existing name.
  private collectDeclaredNames(objects: Microflows.MicroflowObject[]): void {
    for (const obj of objects) {
      switch (obj.$Type) {
        case "Microflows$MicroflowParameterObject":
          this.declaredNames.add(obj.name);
          break;
        case "Microflows$LoopedActivity":
          if (obj.loopSource.$Type === "Microflows$IterableList") {
            this.declaredNames.add(obj.loopSource.variableName);
          }
          this.collectDeclaredNames(obj.objectCollection.objects);
          break;
        case "Microflows$ActionActivity":
          if (obj.action !== null) {
            this.collectDeclaredActionNames(obj.action);
          }
          break;
        default:
          break;
      }
    }
  }

  private collectDeclaredActionNames(action: Microflows.MicroflowAction): void {
    const names: string[] = [];
    if ("outputVariableName" in action) {
      names.push(action.outputVariableName);
    }
    switch (action.$Type) {
      case "Microflows$CreateVariableAction":
      case "Microflows$CallExternalAction":
        names.push(action.variableName);
        break;
      case "Microflows$RestCallAction":
      case "Microflows$WebServiceCallAction":
      case "Microflows$ImportXmlAction":
        names.push(action.resultHandling.outputVariableName);
        break;
      case "Microflows$RestOperationCallAction":
        if (action.outputVariable !== null) {
          names.push(action.outputVariable.variableName);
        }
        break;
      case "Microflows$ExportXmlAction":
        if (action.outputMethod.$Type === "Microflows$VariableExport") {
          names.push(action.outputMethod.outputVariableName);
        }
        break;
      default:
        break;
    }
    names.filter((n) => n.length > 0).forEach((n) => this.declaredNames.add(n));
  }

  //-------------------document level, after detectEntityVariables()----------------------------//
  // Uses the entity: an entity-typed parameter or variable, or an entity return type.
  usesEntity(flow: Microflows.MicroflowBase): boolean {
    return this.entityVariables.size > 0 || this.isEntityType(flow.microflowReturnType);
  }

  shouldRenameDocument(flow: Microflows.MicroflowBase): boolean {
    const rename = this.naming.contains(flow.name) && this.usesEntity(flow);
    console.debug(`document ${flow.name}: rename=${rename}`);
    return rename;
  }

  // The default name callers get for the returned object; not a variable inside this flow.
  updateReturnVariableName(flow: Microflows.MicroflowBase): boolean {
    if (!this.isEntityType(flow.microflowReturnType)) {
      return false;
    }
    const newName = this.naming.rename(flow.returnVariableName);
    if (newName === flow.returnVariableName) {
      return false;
    }
    console.debug(`return variable name '${flow.returnVariableName}' -> '${newName}'`);
    flow.returnVariableName = newName;
    return true;
  }

  // Renamed parameters of this flow; callers reference them as Module.Flow.Parameter.
  parameterRenames(): { oldName: string; newName: string }[] {
    return this.renames
      .filter((r) => (r.target as { $Type?: string }).$Type === "Microflows$MicroflowParameterObject")
      .map((r) => ({ oldName: r.oldName, newName: r.newName }));
  }

  applyRenames(): void {
    this.renames.forEach((rename) => {
      console.debug(`applying rename '${rename.oldName}' -> '${rename.newName}'`);
      rename.apply();
    });
  }

  //------Updating variables usages after variable change.--------------/
  // Covers actions and the non-action objects (decisions, end events, loops, parameters).
  updateObjectUsages(objects: Microflows.MicroflowObject[]): void {
    for (const obj of objects) {
      switch (obj.$Type) {
        case "Microflows$ActionActivity":
          if (obj.action !== null) {
            this.updateActionUsage(obj.action);
          }
          break;
        case "Microflows$ExclusiveSplit": {
          const condition = obj.splitCondition;
          if (condition.$Type === "Microflows$ExpressionSplitCondition") {
            if (condition.expression !== null) {
              condition.expression = this.UpdateValue(condition.expression);
            }
          } else if (condition.$Type === "Microflows$RuleSplitCondition") {
            for (const parMap of condition.ruleCall.parameterMappings) {
              if (parMap.argument !== null) {
                parMap.argument = this.UpdateValue(parMap.argument);
              }
            }
          }
          break;
        }
        case "Microflows$EndEvent":
          if (obj.returnValue !== null) {
            obj.returnValue = this.UpdateValue(obj.returnValue);
          }
          break;
        case "Microflows$InheritanceSplit":
          obj.splitVariableName = this.UpdateVariableName(obj.splitVariableName);
          break;
        case "Microflows$LoopedActivity": {
          const source = obj.loopSource;
          if (source.$Type === "Microflows$IterableList") {
            source.listVariableName = this.UpdateVariableName(source.listVariableName);
          } else if (source.$Type === "Microflows$WhileLoopCondition" && source.whileExpression !== null) {
            source.whileExpression = this.UpdateValue(source.whileExpression);
          }
          this.updateObjectUsages(obj.objectCollection.objects);
          break;
        }
        case "Microflows$MicroflowParameterObject":
          // Only the default value; the parameter name itself is never renamed.
          if (obj.defaultValue !== null) {
            obj.defaultValue = this.UpdateValue(obj.defaultValue);
          }
          break;
        default:
          break;
      }
    }
  }

  // Entity of a module action's output list, from the cache; null when unknown.
  private moduleActionEntity(action: ModuleAction): string | null {
    switch (action.$Type) {
      case "DatabaseConnector$ExecuteDatabaseQueryAction":
        return action.query === null ? null : (this.references.databaseQueryEntities.get(action.query) ?? null);
      case "ExcelDataImporter$ImportExcelDataAction":
        return action.template === null ? null : (this.references.excelTemplateEntities.get(action.template) ?? null);
      case "ConnectorKit$ConnectorActionCallAction":
        return action.connectorAction === null
          ? null
          : (this.references.connectorActionEntities.get(action.connectorAction) ?? null);
    }
  }

  // UNVERIFIED: dynamicQuery and the parameter values are microflow expressions.
  private updateModuleActionUsage(action: ModuleAction): void {
    switch (action.$Type) {
      case "DatabaseConnector$ExecuteDatabaseQueryAction":
        for (const mapping of [...action.parameterMappings, ...action.connectionParameterMappings]) {
          if (mapping.value !== null) {
            mapping.value = this.UpdateValue(mapping.value);
          }
        }
        if (action.dynamicQuery !== null) {
          action.dynamicQuery = this.UpdateValue(action.dynamicQuery);
        }
        break;
      case "ExcelDataImporter$ImportExcelDataAction":
        action.inputFileVariableName = this.UpdateVariableName(action.inputFileVariableName);
        break;
      case "ConnectorKit$ConnectorActionCallAction":
        for (const mapping of action.parameterMappings) {
          if (mapping.parameterValueExpression !== null) {
            mapping.parameterValueExpression = this.UpdateValue(mapping.parameterValueExpression);
          }
        }
        break;
    }
  }

  private updateActionUsage(action: Microflows.MicroflowAction): void {
    const moduleAction = asModuleAction(action);
    if (moduleAction !== null) {
      this.updateModuleActionUsage(moduleAction);
      return;
    }
    switch (action.$Type) {
      case "Microflows$CreateObjectAction":
        for (const item of action.items) {
          if (item.value !== null) {
            item.value = this.UpdateValue(item.value);
          }
        }
        break;
      case "Microflows$ChangeObjectAction":
        action.changeVariableName = this.UpdateVariableName(action.changeVariableName);
        for (const item of action.items) {
          if (item.value !== null) {
            item.value = this.UpdateValue(item.value);
          }
        }
        break;
      case "Microflows$RetrieveAction":
        const retrieveSource = action.retrieveSource;
        switch (retrieveSource.$Type) {
          case "Microflows$AssociationRetrieveSource":
            retrieveSource.startVariableName = this.UpdateVariableName(retrieveSource.startVariableName);
            break;
          case "Microflows$DatabaseRetrieveSource":
            if (retrieveSource.xPathConstraint !== null) {
              retrieveSource.xPathConstraint = this.UpdateValue(retrieveSource.xPathConstraint);
            }
            this.updateRange(retrieveSource.range);
            break;
          default:
            break;
        }
        break;
      case "Microflows$AggregateListAction":
        action.inputListVariableName = this.UpdateVariableName(action.inputListVariableName);
        if (action.expression !== null) {
          action.expression = this.UpdateValue(action.expression);
        }
        if (action.reduceInitialValueExpression !== null) {
          action.reduceInitialValueExpression = this.UpdateValue(action.reduceInitialValueExpression);
        }
        break;
      case "Microflows$ApplyJumpToOptionAction":
        action.workflowJumpToDetailsVariable = this.UpdateVariableName(action.workflowJumpToDetailsVariable);
        break;
      case "Microflows$CallExternalAction":
        for (const parMap of action.parameterMappings) {
          if (parMap.argument !== null) {
            parMap.argument = this.UpdateValue(parMap.argument);
          }
        }
        break;
      case "Microflows$ChangeListAction":
        action.changeVariableName = this.UpdateVariableName(action.changeVariableName);
        if (action.value !== null) {
          action.value = this.UpdateValue(action.value);
        }
        break;
      case "Microflows$ChangeVariableAction":
        action.changeVariableName = this.UpdateVariableName(action.changeVariableName);
        if (action.value !== null) {
          action.value = this.UpdateValue(action.value);
        }
        break;
      case "Microflows$CloseFormAction":
        if (action.numberOfPagesToClose !== null) {
          action.numberOfPagesToClose = this.UpdateValue(action.numberOfPagesToClose);
        }
        break;
      case "Microflows$CommitAction":
        action.commitVariableName = this.UpdateVariableName(action.commitVariableName);
        break;
      case "Microflows$CounterMeterAction":
      case "Microflows$GaugeMeterAction":
        if (action.name !== null) {
          action.name = this.UpdateValue(action.name);
        }
        if (action.value !== null) {
          action.value = this.UpdateValue(action.value);
        }
        for (const tag of action.tags) {
          if (tag.key !== null) {
            tag.key = this.UpdateValue(tag.key);
          }
          if (tag.value !== null) {
            tag.value = this.UpdateValue(tag.value);
          }
        }
        break;
      case "Microflows$CreateVariableAction":
        if (action.initialValue !== null) {
          action.initialValue = this.UpdateValue(action.initialValue);
        }
        break;
      case "Microflows$DeleteAction":
      case "Microflows$DeleteExternalObject":
        action.deleteVariableName = this.UpdateVariableName(action.deleteVariableName);
        break;
      case "Microflows$DownloadFileAction":
        action.fileDocumentVariableName = this.UpdateVariableName(action.fileDocumentVariableName);
        break;
      case "Microflows$GenerateDocumentAction":
        action.fileVariableName = this.UpdateVariableName(action.fileVariableName);
        action.languageVariableName = this.UpdateVariableName(action.languageVariableName);
        for (const parMap of action.parameterMappings) {
          if (parMap.argument !== null) {
            parMap.argument = this.UpdateValue(parMap.argument);
          }
        }
        if (action.marginBottomInInch !== null) {
          action.marginBottomInInch = this.UpdateValue(action.marginBottomInInch);
        }
        if (action.marginLeftInInch !== null) {
          action.marginLeftInInch = this.UpdateValue(action.marginLeftInInch);
        }
        if (action.marginRightInInch !== null) {
          action.marginRightInInch = this.UpdateValue(action.marginRightInInch);
        }
        if (action.marginTopInInch !== null) {
          action.marginTopInInch = this.UpdateValue(action.marginTopInInch);
        }
        break;
      case "Microflows$GenerateJumpToOptionsAction":
      case "Microflows$GetWorkflowActivityRecordsAction":
      case "Microflows$GetWorkflowDataAction":
      case "Microflows$OpenWorkflowAction":
      case "Microflows$NotifyWorkflowAction":
        action.workflowVariable = this.UpdateVariableName(action.workflowVariable);
        break;
      case "Microflows$GetWorkflowsAction":
        action.workflowContextVariableName = this.UpdateVariableName(action.workflowContextVariableName);
        break;
      case "Microflows$ImportXmlAction":
        action.xmlDocumentVariableName = this.UpdateVariableName(action.xmlDocumentVariableName);
        this.updateResultHandling(action.resultHandling);
        break;
      case "Microflows$JavaActionCallAction":
      case "Microflows$JavaScriptActionCallAction":
        // parMap.parameter is the Java(Script) action parameter being filled; the passed value is in parameterValue.
        for (const parMap of action.parameterMappings) {
          this.updateCodeActionParameterValue(parMap.parameterValue);
        }
        break;
      case "Microflows$ListOperationAction":
        const operation = action.operation;
        switch (operation.$Type) {
          case "Microflows$Contains":
          case "Microflows$Intersect":
          case "Microflows$ListEquals":
          case "Microflows$Subtract":
          case "Microflows$Union":
            operation.listVariableName = this.UpdateVariableName(operation.listVariableName);
            operation.secondListOrObjectVariableName = this.UpdateVariableName(
              operation.secondListOrObjectVariableName,
            );
            break;
          case "Microflows$FilterByExpression":
          case "Microflows$FindByExpression":
          case "Microflows$Filter":
          case "Microflows$Find":
            operation.listVariableName = this.UpdateVariableName(operation.listVariableName);
            if (operation.expression !== null) {
              operation.expression = this.UpdateValue(operation.expression);
            }
            break;
          case "Microflows$Head":
          case "Microflows$Tail":
          case "Microflows$Sort":
            operation.listVariableName = this.UpdateVariableName(operation.listVariableName);
            break;
          case "Microflows$ListRange":
            operation.listVariableName = this.UpdateVariableName(operation.listVariableName);
            this.updateRange(operation.customRange);
            break;
          default:
            break;
        }
        break;

      case "Microflows$LogMessageAction":
        for (const argument of action.messageTemplate.arguments) {
          if (argument.expression !== null) {
            argument.expression = this.UpdateValue(argument.expression);
          }
        }
        if (action.node !== null) {
          action.node = this.UpdateValue(action.node);
        }
        break;
      case "Microflows$IncrementCounterMeterAction":
        if (action.name !== null) {
          action.name = this.UpdateValue(action.name);
        }
        for (const tag of action.tags) {
          if (tag.key !== null) {
            tag.key = this.UpdateValue(tag.key);
          }
          if (tag.value !== null) {
            tag.value = this.UpdateValue(tag.value);
          }
        }
        break;
      case "Microflows$MicroflowCallAction":
        for (const ParMap of action.microflowCall.parameterMappings) {
          if (ParMap.argument !== null) {
            ParMap.argument = this.UpdateValue(ParMap.argument);
          }
        }
        break;
      case "Microflows$MLModelCallAction":
        // mlMappingDocument is a document reference, not a variable, so only the input variable is a usage.
        action.inputVariableName = this.UpdateVariableName(action.inputVariableName);
        break;
      case "Microflows$NanoflowCallAction":
        for (const ParMap of action.nanoflowCall.parameterMappings) {
          if (ParMap.argument !== null) {
            ParMap.argument = this.UpdateValue(ParMap.argument);
          }
        }
        break;
      case "Microflows$OpenUserTaskAction":
        action.userTaskVariable = this.UpdateVariableName(action.userTaskVariable);
        break;
      case "Microflows$PushToClientAction":
        action.dataVariableName = this.UpdateVariableName(action.dataVariableName);
        break;
      case "Microflows$RestCallAction":
        // Call REST service: timeout, location/headers/auth, proxy, request body and import mapping parameter.
        // resultHandling.outputVariableName is the output declaration, not a usage.
        if (action.timeOutExpression !== null) {
          action.timeOutExpression = this.UpdateValue(action.timeOutExpression);
        }
        this.updateHttpConfiguration(action.httpConfiguration);
        this.updateProxyConfiguration(action.proxyConfiguration);
        this.updateRequestHandling(action.requestHandling);
        this.updateResultHandling(action.resultHandling);
        break;
      case "Microflows$RestOperationCallAction":
        // Send REST request (consumed REST service): base URL, path/query parameters and body variable.
        // operation is a document reference; outputVariable is the output declaration, not a usage.
        if (action.baseUrlParameterMapping !== null && action.baseUrlParameterMapping.value !== null) {
          action.baseUrlParameterMapping.value = this.UpdateValue(action.baseUrlParameterMapping.value);
        }
        for (const parMap of action.parameterMappings) {
          if (parMap.value !== null) {
            parMap.value = this.UpdateValue(parMap.value);
          }
        }
        for (const queryMap of action.queryParameterMappings) {
          if (queryMap.value !== null) {
            queryMap.value = this.UpdateValue(queryMap.value);
          }
        }
        if (action.bodyVariable !== null) {
          action.bodyVariable.variableName = this.UpdateVariableName(action.bodyVariable.variableName);
        }
        break;
      case "Microflows$RollbackAction":
        action.rollbackVariableName = this.UpdateVariableName(action.rollbackVariableName);
        break;
      case "Microflows$SendEmailAction": {
        // Send email: recipients, subject/body templates, attachment and custom headers of both the real and the
        // test message, plus the connection and basic-auth expressions.
        // UNVERIFIED: which of host/port/emailId/header values are expressions; UpdateValue only touches $Var tokens.
        this.updateEmailMessage(action.emailMessage);
        this.updateEmailMessage(action.testEmailMessage);
        const connection = action.emailConnectionConfig;
        if (connection.host !== null) {
          connection.host = this.UpdateValue(connection.host);
        }
        if (connection.port !== null) {
          connection.port = this.UpdateValue(connection.port);
        }
        if (connection.emailId !== null) {
          connection.emailId = this.UpdateValue(connection.emailId);
        }
        const auth = action.emailAuthenticationConfig;
        // AuthenticationDocumentConfig only references a document, so only basic auth holds expressions.
        if (auth !== null && auth.$Type === "Microflows$BasicAuthConfig") {
          if (auth.username !== null) {
            auth.username = this.UpdateValue(auth.username);
          }
          if (auth.password !== null) {
            auth.password = this.UpdateValue(auth.password);
          }
        }
        break;
      }
      case "Microflows$SendExternalObject":
        action.variableNameToBeSent = this.UpdateVariableName(action.variableNameToBeSent);
        break;
      case "Microflows$SetTaskOutcomeAction":
        action.workflowTaskVariable = this.UpdateVariableName(action.workflowTaskVariable);
        break;
      case "Microflows$ShowMessageAction":
        for (const arg of action.template.arguments) {
          if (arg.expression !== null) {
            arg.expression = this.UpdateValue(arg.expression);
          }
        }
        break;
      case "Microflows$ShowPageAction":
        if (action.numberOfPagesToClose !== null) {
          action.numberOfPagesToClose = this.UpdateValue(action.numberOfPagesToClose);
        }
        const pageSettings = action.pageSettings;
        if (pageSettings.titleOverride !== null) {
          for (const arg of pageSettings.titleOverride.arguments) {
            if (arg.expression !== null) {
              arg.expression = this.UpdateValue(arg.expression);
            }
          }
        }
        for (const parMap of pageSettings.parameterMappings) {
          if (parMap.argument !== null) {
            parMap.argument = this.UpdateValue(parMap.argument);
          }
        }
        break;
      case "Microflows$SynchronizeAction":
        // Synchronize (offline): variableNames holds the bare names of the objects/lists to synchronize.
        action.variableNames = action.variableNames.map((name) => this.UpdateVariableName(name));
        break;
      case "Microflows$TransformJsonAction":
        action.inputVariableName = this.UpdateVariableName(action.inputVariableName);
        break;
      case "Microflows$ValidationFeedbackAction":
        action.objectVariableName = this.UpdateVariableName(action.objectVariableName);
        for (const arg of action.feedbackTemplate.arguments) {
          if (arg.expression !== null) {
            arg.expression = this.UpdateValue(arg.expression);
          }
        }
        break;
      case "Microflows$WebServiceCallAction":
        // Call web service (SOAP): same shape as the REST call, but with separate body and header request handling.
        if (action.timeOutExpression !== null) {
          action.timeOutExpression = this.UpdateValue(action.timeOutExpression);
        }
        this.updateHttpConfiguration(action.httpConfiguration);
        this.updateProxyConfiguration(action.proxyConfiguration);
        this.updateRequestHandling(action.requestBodyHandling);
        this.updateRequestHandling(action.requestHeaderHandling);
        this.updateResultHandling(action.resultHandling);
        break;
      case "Microflows$WorkflowCallAction":
        // workflow is a document reference, not a variable, so only the context variable is a usage.
        action.workflowContextVariable = this.UpdateVariableName(action.workflowContextVariable);
        break;
      case "Microflows$WorkflowOperationAction": {
        const workflowOperation = action.operation;
        workflowOperation.workflowVariable = this.UpdateVariableName(workflowOperation.workflowVariable);
        // Abort workflow: the reason is a template with expression arguments.
        if (workflowOperation.$Type === "Microflows$AbortOperation") {
          this.updateTemplateArguments(workflowOperation.reason);
        }
        break;
      }
      case "Microflows$ExportXmlAction":
        // Export with mapping: the mapping parameter is an input; a file-document export also reads an existing
        // FileDocument variable. VariableExport.outputVariableName is the output declaration, not a usage.
        this.updateRequestHandling(action.resultHandling);
        if (action.outputMethod.$Type === "Microflows$FileDocumentExport") {
          action.outputMethod.targetDocumentVariableName = this.UpdateVariableName(
            action.outputMethod.targetDocumentVariableName,
          );
        }
        break;
      case "Microflows$LockWorkflowAction":
      case "Microflows$UnlockWorkflowAction":
        // Lock/unlock workflow: only the object selection points to a variable (a WorkflowDefinition object);
        // the name selection references the workflow document itself.
        if (
          action.workflowSelection !== null &&
          action.workflowSelection.$Type === "Workflows$WorkflowDefinitionObjectSelection"
        ) {
          action.workflowSelection.workflowDefinitionVariable = this.UpdateVariableName(
            action.workflowSelection.workflowDefinitionVariable,
          );
        }
        break;
      case "Microflows$CancelSynchronizationAction":
        // Cancel synchronization: has no properties.
        break;
      case "Microflows$CastAction":
        // Cast object: only has an output declaration; its input is implied by the preceding inheritance split.
        break;
      case "Microflows$ClearFromClientAction":
        // Clear from device (offline): only references an entity, no variables.
        break;
      case "Microflows$CreateListAction":
        // Create list: only references an entity and declares an output, no variable usages.
        break;
      case "Microflows$ShowHomePageAction":
        // Show home page: has no properties.
        break;
      default:
        break;
    }
  }
  // For expressions: see rewriteExpression.
  UpdateValue(value: string): string {
    return rewriteExpression(value, this.renameMap());
  }
  // For properties that hold a bare variable name (no `$`), e.g. mappingArgumentVariableName.
  UpdateVariableName(name: string): string {
    return rewriteName(name, this.renameMap());
  }

  // First rename per old name wins, as before.
  private renameMap(): RenameMap {
    const map = new Map<string, string>();
    for (const rename of this.renames) {
      if (!map.has(rename.oldName)) {
        map.set(rename.oldName, rename.newName);
      }
    }
    return map;
  }
  // Only a custom range holds expressions (limit/offset).
  private updateRange(range: Microflows.Range): void {
    if (range.$Type !== "Microflows$CustomRange") {
      return;
    }
    if (range.limitExpression !== null) {
      range.limitExpression = this.UpdateValue(range.limitExpression);
    }
    if (range.offsetExpression !== null) {
      range.offsetExpression = this.UpdateValue(range.offsetExpression);
    }
  }
  private updateHttpConfiguration(httpConfiguration: Microflows.HttpConfiguration): void {
    if (httpConfiguration.customLocation !== null) {
      httpConfiguration.customLocation = this.UpdateValue(httpConfiguration.customLocation);
    }
    if (httpConfiguration.customLocationTemplate !== null) {
      this.updateTemplateArguments(httpConfiguration.customLocationTemplate);
    }
    if (httpConfiguration.httpAuthenticationUserName !== null) {
      httpConfiguration.httpAuthenticationUserName = this.UpdateValue(httpConfiguration.httpAuthenticationUserName);
    }
    if (httpConfiguration.authenticationPassword !== null) {
      httpConfiguration.authenticationPassword = this.UpdateValue(httpConfiguration.authenticationPassword);
    }
    this.updateHeaderEntries(httpConfiguration.headerEntries);
  }
  private updateProxyConfiguration(proxy: Microflows.ProxyConfiguration | null): void {
    if (proxy === null) {
      return;
    }
    if (proxy.hostExpression !== null) {
      proxy.hostExpression = this.UpdateValue(proxy.hostExpression);
    }
    if (proxy.portExpression !== null) {
      proxy.portExpression = this.UpdateValue(proxy.portExpression);
    }
    if (proxy.usernameExpression !== null) {
      proxy.usernameExpression = this.UpdateValue(proxy.usernameExpression);
    }
    if (proxy.passwordExpression !== null) {
      proxy.passwordExpression = this.UpdateValue(proxy.passwordExpression);
    }
    if (proxy.useConfigurationExpression !== null) {
      proxy.useConfigurationExpression = this.UpdateValue(proxy.useConfigurationExpression);
    }
  }
  // Only the import mapping parameter and range are usages; outputVariableName is the output declaration.
  private updateResultHandling(resultHandling: Microflows.ResultHandling): void {
    const importMappingCall = resultHandling.importMappingCall;
    if (importMappingCall === null) {
      return;
    }
    importMappingCall.mappingArgumentVariableName = this.UpdateVariableName(
      importMappingCall.mappingArgumentVariableName,
    );
    this.updateRange(importMappingCall.range);
  }
  private updateEmailMessage(message: Microflows.EmailMessage): void {
    if (message.to !== null) {
      message.to = this.UpdateValue(message.to);
    }
    if (message.cc !== null) {
      message.cc = this.UpdateValue(message.cc);
    }
    if (message.bcc !== null) {
      message.bcc = this.UpdateValue(message.bcc);
    }
    // subject/messageBody* are the older plain expressions; the *Template properties are the current ones.
    if (message.subject !== null) {
      message.subject = this.UpdateValue(message.subject);
    }
    if (message.messageBodyHtml !== null) {
      message.messageBodyHtml = this.UpdateValue(message.messageBodyHtml);
    }
    if (message.messageBodyPlainText !== null) {
      message.messageBodyPlainText = this.UpdateValue(message.messageBodyPlainText);
    }
    this.updateTemplateArguments(message.subjectTemplate);
    this.updateTemplateArguments(message.messageBodyHtmlTemplate);
    this.updateTemplateArguments(message.messageBodyPlainTextTemplate);
    // UNVERIFIED: attachment is assumed to be a bare variable name (non-nullable string, like other variable names).
    message.attachment = this.UpdateVariableName(message.attachment);
    for (const header of message.customHeaders) {
      header.value = this.UpdateValue(header.value);
    }
  }
  // Only basic values and string templates hold expressions; the other variants reference an entity or document.
  private updateCodeActionParameterValue(parameterValue: Microflows.CodeActionParameterValue): void {
    switch (parameterValue.$Type) {
      case "Microflows$BasicCodeActionParameterValue":
        if (parameterValue.argument !== null) {
          parameterValue.argument = this.UpdateValue(parameterValue.argument);
        }
        break;
      case "Microflows$StringTemplateParameterValue":
        for (const arg of parameterValue.typedTemplate.arguments) {
          // TypedTemplateArgument is an untyped base; PrimitiveTypedTemplateArgument is the only variant with an expression.
          const primitiveArg = arg as Microflows.PrimitiveTypedTemplateArgument;
          if (primitiveArg.$Type === "Microflows$PrimitiveTypedTemplateArgument" && primitiveArg.expression !== null) {
            primitiveArg.expression = this.UpdateValue(primitiveArg.expression);
          }
        }
        break;
      default:
        break;
    }
  }
  private updateHeaderEntries(headerEntries: Microflows.HttpHeaderEntry[]): void {
    for (const header of headerEntries) {
      if (header.value !== null) {
        header.value = this.UpdateValue(header.value);
      }
    }
  }
  private updateTemplateArguments(template: Microflows.TemplateBase): void {
    for (const arg of template.arguments) {
      if (arg.expression !== null) {
        arg.expression = this.UpdateValue(arg.expression);
      }
    }
  }
  // Covers every RequestHandling variant so WebServiceCallAction (requestBodyHandling/requestHeaderHandling) can reuse it.
  private updateRequestHandling(requestHandling: Microflows.RequestHandling): void {
    switch (requestHandling.$Type) {
      case "Microflows$CustomRequestHandling":
        this.updateTemplateArguments(requestHandling.template);
        break;
      case "Microflows$MappingRequestHandling":
        requestHandling.mappingArgumentVariableName = this.UpdateVariableName(
          requestHandling.mappingArgumentVariableName,
        );
        break;
      case "Microflows$BinaryRequestHandling":
        if (requestHandling.expression !== null) {
          requestHandling.expression = this.UpdateValue(requestHandling.expression);
        }
        break;
      case "Microflows$FormDataRequestHandling":
        for (const part of requestHandling.parts) {
          if (part.value !== null) {
            part.value = this.UpdateValue(part.value);
          }
          this.updateHeaderEntries(part.headerEntries);
        }
        break;
      case "Microflows$SimpleRequestHandling":
        for (const parMap of requestHandling.parameterMappings) {
          if (parMap.argument !== null) {
            parMap.argument = this.UpdateValue(parMap.argument);
          }
        }
        break;
      case "Microflows$AdvancedRequestHandling":
        for (const parMap of requestHandling.parameterMappings) {
          if (parMap.argument !== null) {
            parMap.argument = this.UpdateValue(parMap.argument);
          }
          parMap.mappingArgumentVariableName = this.UpdateVariableName(parMap.mappingArgumentVariableName);
        }
        break;
      default:
        break;
    }
  }
}

// The query, template or connector action a module action needs resolved for its output type.
function collectModuleActionReference(action: ModuleAction, refs: FlowReferences): void {
  switch (action.$Type) {
    case "DatabaseConnector$ExecuteDatabaseQueryAction":
      if (action.query !== null) {
        refs.databaseQueries.add(action.query);
      }
      break;
    case "ExcelDataImporter$ImportExcelDataAction":
      if (action.template !== null) {
        refs.excelTemplates.add(action.template);
      }
      break;
    case "ConnectorKit$ConnectorActionCallAction":
      if (action.connectorAction !== null) {
        refs.connectorActions.add(action.connectorAction);
      }
      break;
  }
}

//--------------------------------------------------------------------------/
// One pending rename; apply writes the new name to whichever property declared the variable.
class VariableRename {
  readonly oldName: string;
  readonly newName: string;
  readonly target: object;
  private readonly setter: (name: string) => void;

  constructor(oldName: string, newName: string, target: object, setter: (name: string) => void) {
    this.oldName = oldName;
    this.newName = newName;
    this.target = target;
    this.setter = setter;
  }

  apply(): void {
    this.setter(this.newName);
  }
}
