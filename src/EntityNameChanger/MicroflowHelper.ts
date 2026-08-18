import {
  DomainModels,
  getContainer,
  Primitives,
  Microflows,
} from "@mendix/extensions-api";

export class MicroflowHelper {
  readonly entity: DomainModels.Entity;
  readonly entityQname: string;
  readonly newName: string;
  readonly actionHelperList: ActionHelper[];

  constructor(
    entity: DomainModels.Entity,
    domainModels: readonly Readonly<Primitives.UnitInfo>[],
    newName: string,
  ) {
    this.entity = entity;
    this.entityQname = this.setQualifiedName(entity, domainModels);
    this.newName = newName;
    this.actionHelperList = [];
  }

  setQualifiedName(
    element: any,
    domainModels: readonly Readonly<Primitives.UnitInfo>[],
  ): string {
    const dmID = getContainer<DomainModels.DomainModel>(element)?.$ID;
    const domainName = domainModels.find((i) => i.$ID === dmID)?.moduleName;
    return `${domainName}.${element.name}`;
  }

  checkAndUpdateAction(
    action: Microflows.CreateObjectAction | Microflows.CreateListAction,
  ): void {
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
  checkAndUpdateMicroflowCall(
    action: Microflows.MicroflowCallAction,
    qName: string,
  ): boolean {
    if (this.notEntity(qName)) {
      return false;
    }
    this.CreateActionHelper(action);
    return false;
  }
  checkAndUpdateListOperation(action: Microflows.ListOperationAction): void {
    if (
      this.actionHelperList.find(
        (a) =>
          a.action.outputVariableName === action.operation.listVariableName,
      ) !== undefined
    ) {
      this.CreateActionHelper(action);
    }
  }
  private CreateActionHelper(action: any) {
    const updatedName = this.getNewElementName(action.outputVariableName);
    if (this.notExistingName(action.outputVariableName, updatedName)) {
      this.actionHelperList.push(new ActionHelper(action, updatedName));
    }
  }
  private notEntity(qName: string | null): boolean {
    return qName === null ? false : qName !== this.entityQname;
  }
  private notExistingName(newName: string, existingName: string): boolean {
    return newName !== existingName;
  }
  private getNewElementName(name: string): string {
    return name.replaceAll(this.entity.name, this.newName);
  }
  updateActionNames(): void {
    this.actionHelperList.forEach((ah) => {
      ah.updateName();
    });
  }
}
class ActionHelper {
  readonly action: any;
  readonly name: string;

  constructor(action: any, name: string) {
    this.action = action;
    this.name = name;
  }

  updateName() {
    this.action.outputVariableName = this.name;
  }
}
