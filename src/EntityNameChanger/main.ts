import * as Mx from "@mendix/extensions-api";

import * as base from "./base";
import { getEntities, getActionActivities } from "./Get";
import { MicroflowHelper } from "./MicroflowHelper";

import markup from "./ui/index.html";
import styles from "./ui/styles.css";

export const component: Mx.IComponent = {
  async loaded(componentContext: Mx.ComponentContext) {
    //Initialization
    const studioPro = Mx.getStudioProApi(componentContext);
    const { domainModels, modules, microflows } = studioPro.app.model;
    loadUI(await studioPro.ui.preferences.getPreferences());
    const entities = await getEntities(domainModels, modules);
    base.populateDropdown(entities);
    base.initGroupBoxes();

    //Run-time
    document
      .getElementById("changeName")!
      .addEventListener("click", async () => {
        const entityID =
          document.querySelector<HTMLSelectElement>("#entityDropdown")!.value;
        const newName =
          document.querySelector<HTMLSelectElement>("#nameInput")!.value;
        const entity: Mx.DomainModels.Entity | undefined = entities.find(
          (e) => e.$ID === entityID,
        );
        if (entity === undefined) {
          base.showStatus("Select an entity to rename.", "error");
        } else if (newName === null || newName.length === 0) {
          base.showStatus("Fill in a new name.", "error");
        } else if (newName.match(/^[A-Za-z]\w*$/)) {
          const microflowHelper = new MicroflowHelper(
            entity,
            await domainModels.getUnitsInfo(),
            newName,
          );
          const result: string = await ChangeMicroflowNames(
            microflowHelper,
            microflows,
          );
          base.showStatus(`${entity.name} successful`, result);
        } else {
          base.showStatus(
            "Name contains spaces or illegal characters",
            "error",
          );
        }
      });
  },
};

//Loads UI from HTML and CSS files.
export function loadUI(preference: Mx.Preferences): void {
  console.log("UI import started");
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.append(style);
  if (preference.theme === "Dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    console.log("Dark mode enabled");
  } else {
    document.documentElement.removeAttribute("data-theme");
    console.log("light mode enabled");
  }
  const root = document.getElementById("root")!;
  root.innerHTML = markup;
  console.log("UI import ended");
}

async function ChangeMicroflowNames(
  microflowHelper: MicroflowHelper,
  microflows: Mx.ModelAccessWithComponent<
    Mx.IMicroflowModelApi,
    Mx.Microflows.Microflow
  >,
): Promise<string> {
  const infos = await microflows.getUnitsInfo();
  try {
    const ids = infos
      .filter((i) => i.$Type === "Microflows$Microflow")
      .map((i) => i.$ID);
    const flows = await microflows.loadAll(
      (info: Mx.Primitives.UnitInfo) => ids.includes(info.$ID),
      ids.length,
    );

    for (const flow of flows) {
      console.debug(`checking ${flow.name}`);
      var update: boolean = false;
      const actionActivities: Mx.Microflows.ActionActivity[] =
        getActionActivities(flow.objectCollection);

      for (const ActionActivity of actionActivities) {
        if (ActionActivity.action === null) {
          continue;
        }
        const action = ActionActivity.action;
        switch (action.$Type) {
          case "Microflows$CreateObjectAction":
            console.debug(
              `checking create object ${action.outputVariableName} for ${action.entity} object`,
            );
            microflowHelper.checkAndUpdateAction(action);
            break;
          case "Microflows$CreateListAction":
            console.debug(
              `checking create list ${action.outputVariableName} for ${action.entity} object`,
            );
            microflowHelper.checkAndUpdateAction(action);
            break;
          case "Microflows$RetrieveAction":
            console.debug(
              `checking retrieve ${action.outputVariableName} with ${action.retrieveSource.$Type} source`,
            );
            microflowHelper.checkAndUpdateRetrieve(action);
            break;
          case "Microflows$MicroflowCallAction": {
            console.debug(
              `checking microflow call calling ${action.microflowCall}`,
            );
            if (!action.useReturnVariable) {
              console.debug(`${action.microflowCall} does not return anything`);
              continue;
            }
            const calledFlow = flows.find(
              (f) => f.name === action.microflowCall.microflow?.split(".")[1],
            );
            if (calledFlow === undefined) {
              continue;
            }
            const returnType = calledFlow.microflowReturnType;
            if (
              returnType.$Type === "DataTypes$ObjectType" ||
              returnType.$Type === "DataTypes$ListType"
            ) {
              console.debug(
                `checking microflow call calling ${action.microflowCall} for ${returnType.entity} object/list`,
              );
              microflowHelper.checkAndUpdateMicroflowCall(
                action,
                returnType.entity,
              );
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
    }
  } catch (error: any) {
    console.log(`Could not update flow names because of error ${error}`);
    return "Error";
  }
  return "Success";
}
