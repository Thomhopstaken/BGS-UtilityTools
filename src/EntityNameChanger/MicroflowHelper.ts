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
          if (action.inputListVariableName !== null) {
            action.inputListVariableName = this.UpdateValue(action.inputListVariableName);
          }
          if (action.expression !== null) {
            action.expression = this.UpdateValue(action.expression);
          }
          break;
        case "Microflows$ApplyJumpToOptionAction":
          if (action.workflowJumpToDetailsVariable !== null) {
            action.workflowJumpToDetailsVariable = this.UpdateValue(action.workflowJumpToDetailsVariable);
          }
          break;
        case "Microflows$CallExternalAction":
          for (const parMap of action.parameterMappings) {
            if (parMap.argument !== null) {
              parMap.argument = this.UpdateValue(parMap.argument);
            }
          }
          break;
        case "Microflows$ChangeListAction":
          action.changeVariableName = this.UpdateValue(action.changeVariableName);
          if (action.value !== null) {
            action.value = this.UpdateValue(action.value);
          }
          break;
        case "Microflows$ChangeVariableAction":
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
          if (action.commitVariableName !== null) {
            action.commitVariableName = this.UpdateValue(action.commitVariableName);
          }
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
          if (action.deleteVariableName !== null) {
            action.deleteVariableName = this.UpdateValue(action.deleteVariableName);
          }
          break;
        case "Microflows$DownloadFileAction":
          if (action.fileDocumentVariableName !== null) {
            action.fileDocumentVariableName = this.UpdateValue(action.fileDocumentVariableName);
          }
          break;
        case "Microflows$GenerateDocumentAction":
          if (action.fileVariableName !== null) {
            action.fileVariableName = this.UpdateValue(action.fileVariableName);
          }
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
          if (action.workflowVariable !== null) {
            action.workflowVariable = this.UpdateValue(action.workflowVariable);
          }
          break;
        case "Microflows$GetWorkflowsAction":
          if (action.workflowContextVariableName !== null) {
            action.workflowContextVariableName = this.UpdateValue(action.workflowContextVariableName);
          }
          break;
        case "Microflows$ImportXmlAction":
          if (action.xmlDocumentVariableName !== null) {
            action.xmlDocumentVariableName = this.UpdateValue(action.xmlDocumentVariableName);
          }
          break;
        case "Microflows$JavaActionCallAction":
        case "Microflows$JavaScriptActionCallAction":
          for (const parMap of action.parameterMappings) {
            if (parMap.parameter !== null) {
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
              if (operation.listVariableName !== null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              if (operation.secondListOrObjectVariableName !== null) {
                operation.secondListOrObjectVariableName = this.UpdateValue(operation.secondListOrObjectVariableName);
              }
              break;
            case "Microflows$FilterByExpression":
            case "Microflows$FindByExpression":
            case "Microflows$Filter":
            case "Microflows$Find":
              if (operation.listVariableName !== null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              if (operation.expression !== null) {
                operation.expression = this.UpdateValue(operation.expression);
              }
              break;
            case "Microflows$Head":
            case "Microflows$Tail":
            case "Microflows$Sort":
              if (operation.listVariableName !== null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              break;
            case "Microflows$ListRange":
              if (operation.listVariableName !== null) {
                operation.listVariableName = this.UpdateValue(operation.listVariableName);
              }
              if (operation.customRange.limitExpression !== null) {
                operation.customRange.limitExpression = this.UpdateValue(operation.customRange.limitExpression);
              }
              if (operation.customRange.offsetExpression !== null) {
                operation.customRange.offsetExpression = this.UpdateValue(operation.customRange.offsetExpression);
              }
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
          if (action.inputVariableName !== null) {
            action.inputVariableName = this.UpdateValue(action.inputVariableName);
          }
          if (action.mlMappingDocument !== null) {
            action.mlMappingDocument = this.UpdateValue(action.inputVariableName);
          }
          break;
        case "Microflows$NanoflowCallAction":
          for (const ParMap of action.nanoflowCall.parameterMappings) {
            if (ParMap.argument !== null) {
              ParMap.argument = this.UpdateValue(ParMap.argument);
            }
          }
          break;
        case "Microflows$OpenUserTaskAction":
          if (action.userTaskVariable !== null) {
            action.userTaskVariable = this.UpdateValue(action.userTaskVariable);
          }
          break;
        case "Microflows$PushToClientAction":
          if (action.dataVariableName !== null) {
            action.dataVariableName = this.UpdateValue(action.dataVariableName);
          }
          break;
        case "Microflows$RestCallAction":
          // do this later
          break;
        case "Microflows$RestOperationCallAction":
          // do this later
          break;
        case "Microflows$RollbackAction":
          if (action.rollbackVariableName !== null) {
            action.rollbackVariableName = this.UpdateValue(action.rollbackVariableName);
          }
          break;
        case "Microflows$SendEmailAction":
          //the fuck is this???
          break;
        case "Microflows$SendExternalObject":
          if (action.variableNameToBeSent !== null) {
            action.variableNameToBeSent = this.UpdateValue(action.variableNameToBeSent);
          }
          break;
        case "Microflows$SetTaskOutcomeAction":
          if (action.workflowTaskVariable !== null) {
            action.workflowTaskVariable = this.UpdateValue(action.workflowTaskVariable);
          }
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
          // Do later.
          break;
        case "Microflows$TransformJsonAction":
          if (action.inputVariableName !== null) {
            action.inputVariableName = this.UpdateValue(action.inputVariableName);
          }
          break;
        case "Microflows$ValidationFeedbackAction":
          if (action.objectVariableName !== null) {
            action.objectVariableName = this.UpdateValue(action.objectVariableName);
          }
          for (const arg of action.feedbackTemplate.arguments) {
            if (arg.expression !== null) {
              arg.expression = this.UpdateValue(arg.expression);
            }
          }
          break;
        case "Microflows$WebServiceCallAction":
          // Do later.
          break;
        case "Microflows$WorkflowCallAction":
          if (action.workflow !== null) {
            action.workflow = this.UpdateValue(action.workflow);
          }
          if (action.workflowContextVariable !== null) {
            action.workflowContextVariable = this.UpdateValue(action.workflowContextVariable);
          }
          break;
        case "Microflows$WorkflowOperationAction":
          if (action.operation.workflowVariable !== null) {
            action.operation.workflowVariable = this.UpdateValue(action.operation.workflowVariable);
          }
          break;
        default:
          //TO TEST:
          //Microflows$CancelSynchronizationAction: has input, not reachable.
          //Microflows$CastAction: has input, not reachable.
          //Microflows$ClearFromClientAction: unsure what this is.
          //Microflows$LockWorkflowAction: check this later. potentially skippable.
          //Microflows$SendEmailAction: what the helly.
          //SynchronizeAction: do later.
          //RestCallAction: do later.
          //RestOperationCallAction: do later.
          //WebServiceCallAction: do later.
          //UnlockWorkflowAction: unsure of input, check later.

          //Skippable:
          //Microflows$CreateListAction
          //Microflows$ExportXmlAction
          //Microflows$ShowHomePageAction
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
    const calledVariables = value.match(regex);

    for (const CalledVariable in calledVariables) {
      const actionHelper = this.actionHelperList.find((ah) => `$${ah.oldOutVarName}` === CalledVariable);
      if (actionHelper === undefined) {
        continue;
      }
      newValue = value.replaceAll(CalledVariable, `$${actionHelper.newOutVarName}`);
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
