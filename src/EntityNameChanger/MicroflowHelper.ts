import { DomainModels, Primitives, Microflows } from "@mendix/extensions-api";
import { setQualifiedName } from "./moduleModel";

export class MicroflowHelper {
  readonly entity: DomainModels.Entity;
  readonly entityQname: string;
  readonly newName: string;
  readonly actionHelperList: ActionHelper[];

  constructor(entity: DomainModels.Entity, domainModels: readonly Readonly<Primitives.UnitInfo>[], newName: string) {
    this.entity = entity;
    this.entityQname = setQualifiedName(entity, domainModels);
    this.newName = newName;
    this.actionHelperList = [];
  }

  checkAndUpdateAction(action: Microflows.CreateObjectAction | Microflows.CreateListAction): void {
    if (!this.notEntity(action.entity)) {
      this.CreateActionHelper(action);
    }
  }

  checkAndUpdateRetrieve(action: Microflows.RetrieveAction): void {
    const retrieve = action.retrieveSource;
    switch (retrieve.$Type) {
      case "Microflows$DatabaseRetrieveSource":
        if (this.notEntity(retrieve.entity)) {
          break;
        }
        this.CreateActionHelper(action);
        break;
      case "Microflows$AssociationRetrieveSource":
        if (
          retrieve.association?.startsWith(this.entityQname.split(".")[0]) &&
          retrieve.association.includes(this.entity.name)
        ) {
          if (retrieve.startVariableName !== this.entity.name) {
            break;
          }
          this.CreateActionHelper(action);
        }
        break;
      default:
        break;
    }
  }
  checkAndUpdateMicroflowCall(action: Microflows.MicroflowCallAction, qName: string): boolean {
    if (this.notEntity(qName)) {
      return false;
    }
    this.CreateActionHelper(action);
    return false;
  }
  checkAndUpdateListOperation(action: Microflows.ListOperationAction): void {
    if (
      this.actionHelperList.find((a) => a.action.outputVariableName === action.operation.listVariableName) !== undefined
    ) {
      this.CreateActionHelper(action);
    }
  }
  private CreateActionHelper(action: any) {
    const updatedName = this.getNewElementName(action.outputVariableName);
    if (this.notExistingName(action.outputVariableName, updatedName)) {
      this.actionHelperList.push(new ActionHelper(action, updatedName, action.outputVariableName));
    }
  }
  private notEntity(qName: string | null): boolean {
    return qName === null ? false : qName !== this.entityQname;
  }
  notExistingName(newName: string, existingName: string): boolean {
    return newName !== existingName;
  }
  getNewElementName(name: string): string {
    return name.replaceAll(this.entity.name, this.newName);
  }
  updateActionNames(): void {
    this.actionHelperList.forEach((ah) => {
      ah.updateName();
    });
  }

  //--------------------------------------------------------------------------/
  updateActionUsages(actionActivities: Microflows.ActionActivity[]): void {
    for (const ActionActivity of actionActivities) {
      if (ActionActivity.action === null) {
        continue;
      }
      const action = ActionActivity.action;
      switch (action?.$Type) {
        case "Microflows$CreateObjectAction":
          for (const item of action.items) {
            if (item.value !== null) {
              item.value = this.UpdateValue(item.value);
            }
          }
          break;
        case "Microflows$ChangeObjectAction":
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
              if (retrieveSource.startVariableName !== null) {
                retrieveSource.startVariableName = this.UpdateValue(retrieveSource.startVariableName);
              }
              break;
            case "Microflows$DatabaseRetrieveSource":
              if (retrieveSource.xPathConstraint !== null) {
                retrieveSource.xPathConstraint = this.UpdateValue(retrieveSource.xPathConstraint);
              }
              break;
            default:
              break;
          }
          break;
        case "Microflows$AggregateListAction":
          if (action.inputListVariableName != null) {
            action.inputListVariableName = this.UpdateValue(action.inputListVariableName);
          }
          if (action.expression != null) {
            action.expression = this.UpdateValue(action.expression);
          }
          break;
        case "Microflows$ApplyJumpToOptionAction":
          if (action.workflowJumpToDetailsVariable != null) {
            action.workflowJumpToDetailsVariable = this.UpdateValue(action.workflowJumpToDetailsVariable);
          }
          break;
        case "Microflows$CallExternalAction":
          for (const parMap of action.parameterMappings) {
            if (parMap.argument != null) {
              parMap.argument = this.UpdateValue(parMap.argument);
            }
          }
          break;
        case "Microflows$ChangeListAction":
          action.changeVariableName = this.UpdateValue(action.changeVariableName);
          if (action.value != null) {
            action.value = this.UpdateValue(action.value);
          }
          break;
        case "Microflows$ChangeVariableAction":
          if (action.value != null) {
            action.value = this.UpdateValue(action.value);
          }
          break;
        case "Microflows$CloseFormAction":
          if (action.numberOfPagesToClose != null) {
            action.numberOfPagesToClose = this.UpdateValue(action.numberOfPagesToClose);
          }
          break;
        case "Microflows$CommitAction":
          if (action.commitVariableName != null) {
            action.commitVariableName = this.UpdateValue(action.commitVariableName);
          }
          break;
        case "Microflows$CounterMeterAction":
        case "Microflows$GaugeMeterAction":
          if (action.name != null) {
            action.name = this.UpdateValue(action.name);
          }
          if (action.value != null) {
            action.value = this.UpdateValue(action.value);
          }
          for (const tag of action.tags) {
            if (tag.key != null) {
              tag.key = this.UpdateValue(tag.key);
            }
            if (tag.value != null) {
              tag.value = this.UpdateValue(tag.value);
            }
          }
          break;
        case "Microflows$CreateVariableAction":
          if (action.initialValue != null) {
            action.initialValue = this.UpdateValue(action.initialValue);
          }
          break;
        case "Microflows$DeleteAction":
        case "Microflows$DeleteExternalObject":
          if (action.deleteVariableName != null) {
            action.deleteVariableName = this.UpdateValue(action.deleteVariableName);
          }
          break;
        case "Microflows$DownloadFileAction":
          if (action.fileDocumentVariableName != null) {
            action.fileDocumentVariableName = this.UpdateValue(action.fileDocumentVariableName);
          }
          break;
        case "Microflows$GenerateDocumentAction":
          if (action.fileVariableName != null) {
            action.fileVariableName = this.UpdateValue(action.fileVariableName);
          }
          for (const parMap of action.parameterMappings) {
            if (parMap.argument != null) {
              parMap.argument = this.UpdateValue(parMap.argument);
            }
          }
          if (action.marginBottomInInch != null) {
            action.marginBottomInInch = this.UpdateValue(action.marginBottomInInch);
          }
          if (action.marginLeftInInch != null) {
            action.marginLeftInInch = this.UpdateValue(action.marginLeftInInch);
          }
          if (action.marginRightInInch != null) {
            action.marginRightInInch = this.UpdateValue(action.marginRightInInch);
          }
          if (action.marginTopInInch != null) {
            action.marginTopInInch = this.UpdateValue(action.marginTopInInch);
          }
          break;
        case "Microflows$GenerateJumpToOptionsAction":
        case "Microflows$GetWorkflowActivityRecordsAction":
        case "Microflows$GetWorkflowDataAction":
          if (action.workflowVariable != null) {
            action.workflowVariable = this.UpdateValue(action.workflowVariable);
          }
          break;
        case "Microflows$GetWorkflowsAction":
          if (action.workflowContextVariableName != null) {
            action.workflowContextVariableName = this.UpdateValue(action.workflowContextVariableName);
          }
          break;
        case "Microflows$ImportXmlAction":
          if (action.xmlDocumentVariableName != null) {
            action.xmlDocumentVariableName = this.UpdateValue(action.xmlDocumentVariableName);
          }
          break;
        case "Microflows$JavaActionCallAction":
        case "Microflows$JavaScriptActionCallAction":
          for (const parMap of action.parameterMappings) {
            if (parMap.parameter != null) {
              parMap.parameter = this.UpdateValue(parMap.parameter);
            }
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
              if (operation.listVariableName != null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              if (operation.secondListOrObjectVariableName != null) {
                operation.secondListOrObjectVariableName = this.UpdateValue(operation.secondListOrObjectVariableName);
              }
              break;
            case "Microflows$FilterByExpression":
            case "Microflows$FindByExpression":
            case "Microflows$Filter":
            case "Microflows$Find":
              if (operation.listVariableName != null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              if (operation.expression != null) {
                operation.expression = this.UpdateValue(operation.expression);
              }
              break;
            case "Microflows$Head":
            case "Microflows$Tail":
            case "Microflows$Sort":
              if (operation.listVariableName != null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              break;
            case "Microflows$ListRange":
              if (operation.listVariableName != null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              if (operation.customRange.limitExpression != null) {
                operation.customRange.limitExpression = this.UpdateValue(operation.customRange.limitExpression);
              }
              if (operation.customRange.offsetExpression != null) {
                operation.customRange.offsetExpression = this.UpdateValue(operation.customRange.offsetExpression);
              }
              break;
            default:
              break;
          }
          break;
        case "Microflows$LockWorkflowAction":
        case "Microflows$LogMessageAction":
        case "Microflows$IncrementCounterMeterAction":
        case "Microflows$MicroflowCallAction":
        case "Microflows$MLModelCallAction":
        case "Microflows$NanoflowCallAction":
        case "Microflows$NotifyWorkflowAction":
        case "Microflows$OpenUserTaskAction":
        case "Microflows$OpenWorkflowAction":
        case "Microflows$PushToClientAction":
        case "Microflows$RestCallAction":
        case "Microflows$RestOperationCallAction":
        case "Microflows$RollbackAction":
        case "Microflows$SendEmailAction":
        case "Microflows$SendExternalObject":
        case "Microflows$SetTaskOutcomeAction":
        case "Microflows$ShowHomePageAction":
        case "Microflows$ShowMessageAction":
        case "Microflows$ShowPageAction":
        case "Microflows$SynchronizeAction":
        case "Microflows$TransformJsonAction":
        case "Microflows$UnlockWorkflowAction":
        case "Microflows$ValidationFeedbackAction":
        case "Microflows$WebServiceCallAction":
        case "Microflows$WorkflowCallAction":
        case "Microflows$WorkflowOperationAction":
        default:
          //TO TEST:
          //Microflows$CancelSynchronizationAction: has input, not reachable.
          //Microflows$CastAction: has input, not reachable.
          //Microflows$ClearFromClientAction: unsure what this is.

          //Skippable:
          //Microflows$CreateListAction
          //Microflows$ExportXmlAction
          continue;
      }
    }
  }
  UpdateValue(value: string): string {
    if (value.trim() === "") {
      return value;
    }

    const regex = /\$[A-Za-z0-9_]+(?=[/)\]\s]|$)/g;
    var newValue: string = value;
    const calledObjects = value.match(regex);

    for (const object in calledObjects) {
      const actionHelper = this.actionHelperList.find((ah) => `$${ah.oldOutVarName}` === object);
      if (actionHelper === undefined) {
        continue;
      }
      newValue = value.replaceAll(object, `$${actionHelper.newOutVarName}`);
    }

    return value !== newValue ? newValue : value;
  }
}

//--------------------------------------------------------------------------/
class ActionHelper {
  readonly action: any;
  readonly newOutVarName: string;
  readonly oldOutVarName: string;

  constructor(action: any, newName: string, existingName: string) {
    this.action = action;
    this.newOutVarName = newName;
    this.oldOutVarName = existingName;
  }

  updateName() {
    this.action.outputVariableName = this.newOutVarName;
  }
}
