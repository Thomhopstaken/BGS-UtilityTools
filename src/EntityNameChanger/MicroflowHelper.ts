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
              retrieveSource.startVariableName = this.UpdateValue(retrieveSource.startVariableName);
              break;
              break;
            case "Microflows$DatabaseRetrieveSource":
              if (retrieveSource.xPathConstraint !== null) {
                retrieveSource.xPathConstraint = this.UpdateValue(retrieveSource.xPathConstraint);
              }
              break;
          }
        default:
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
