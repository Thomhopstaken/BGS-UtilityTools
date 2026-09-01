import * as Mx from "@mendix/extensions-api";

import { MicroflowHelper } from "./MicroflowHelper";

export async function ChangeMicroflowNames(
  microflowHelper: MicroflowHelper,
  microflows: Mx.ModelAccessWithComponent<Mx.IMicroflowModelApi, Mx.Microflows.Microflow>,
  appStoreList: Set<string>,
): Promise<string> {
  const infos = await microflows.getUnitsInfo();
  try {
    const ids = infos
      .filter(
        (i) => i.$Type === "Microflows$Microflow" && i.moduleName !== undefined && !appStoreList.has(i.moduleName),
      )
      .map((i) => i.$ID);
    const flows = await microflows.loadAll((info: Mx.Primitives.UnitInfo) => ids.includes(info.$ID), ids.length);

    for (const flow of flows) {
      console.log(`checking ${flow.name}`);
      const actionActivities: Mx.Microflows.ActionActivity[] = getActionActivities(flow.objectCollection);

      for (const ActionActivity of actionActivities) {
        if (ActionActivity.action === null) {
          continue;
        }
        const action = ActionActivity.action;
        switch (action.$Type) {
          case "Microflows$CreateObjectAction":
            console.debug(`checking create object ${action.outputVariableName} for ${action.entity} object`);
            microflowHelper.checkAndUpdateAction(action);
            break;
          case "Microflows$CreateListAction":
            console.debug(`checking create list ${action.outputVariableName} for ${action.entity} object`);
            microflowHelper.checkAndUpdateAction(action);
            break;
          case "Microflows$RetrieveAction":
            console.debug(`checking retrieve ${action.outputVariableName} with ${action.retrieveSource.$Type} source`);
            microflowHelper.checkAndUpdateRetrieve(action);
            break;
          case "Microflows$MicroflowCallAction": {
            console.debug(`checking microflowCall calling ${action.microflowCall.microflow}`);
            if (!action.useReturnVariable) {
              console.debug(`${action.microflowCall.microflow} does not return anything`);
              continue;
            }
            const calledFlow = flows.find((f) => f.name === action.microflowCall.microflow?.split(".")[1]);
            if (calledFlow === undefined) {
              continue;
            }
            const returnType = calledFlow.microflowReturnType;
            if (returnType.$Type === "DataTypes$ObjectType" || returnType.$Type === "DataTypes$ListType") {
              console.debug(
                `checking microflowCall calling ${action.microflowCall.microflow} for ${returnType.entity} object/list`,
              );
              microflowHelper.checkAndUpdateMicroflowCall(action, returnType.entity);
            }
            break;
          }
          case "Microflows$ListOperationAction":
            console.debug(
              `checking list operation ${action.outputVariableName} using ${action.operation.listVariableName} for ${action.operation.$Type} operation`,
            );
            microflowHelper.checkAndUpdateListOperation(action);
            break;
          default:
            console.debug(`checking ${action.$Type} action not supported`);
            continue;
        }
      }

      const parameters = flow.parameters;
      for (const parameter in parameters) {
        console.log(parameter);
      }

      if (microflowHelper.actionHelperList.length === 0) {
        console.log(`No Actions found to update, continue...`);
        continue;
      }
      microflowHelper.updateActionNames();
      microflowHelper.updateActionUsages(actionActivities);
      const updatedName = microflowHelper.getNewElementName(flow.name);
      if (microflowHelper.notExistingName(updatedName, flow.name)) {
        flow.name = updatedName;
      }
      microflows.save(flow);
    }
  } catch (error: any) {
    console.log(`Could not update flow names because of error ${error}`);
    return "Error";
  }
  return "Success";
}

function getActionActivities(collection: Mx.Microflows.MicroflowObjectCollection): Mx.Microflows.ActionActivity[] {
  const result: Mx.Microflows.ActionActivity[] = [];
  for (const obj of collection.objects) {
    if (obj.$Type === "Microflows$ActionActivity") {
      result.push(obj);
    } else if (obj.$Type === "Microflows$LoopedActivity") {
      result.push(...getActionActivities(obj.objectCollection));
    }
  }
  return result;
}
