import * as Mx from "@mendix/extensions-api";

import { MicroflowHelper } from "./MicroflowHelper";
import * as ui from "./ui";
import { getEntities, getAppstoreModuleNames } from "./moduleModel";
import { ChangeMicroflowNames } from "./microflowRenamer";

export const component: Mx.IComponent = {
  async loaded(componentContext: Mx.ComponentContext) {
    //Initialization
    const studioPro = Mx.getStudioProApi(componentContext);
    const { domainModels, modules, microflows } = studioPro.app.model;
    ui.loadUI(await studioPro.ui.preferences.getPreferences());
    const modulelist = await modules.getModules();
    const appStoreList = getAppstoreModuleNames(modulelist);
    var entities = await getEntities(domainModels, modulelist, appStoreList);
    ui.populateDropdown(entities, await domainModels.getUnitsInfo());
    ui.initGroupBoxes();

    //Run-time
    document.getElementById("changeName")!.addEventListener("click", async () => {
      const entityID = document.querySelector<HTMLSelectElement>("#entityDropdown")!.value;
      const newName = document.querySelector<HTMLSelectElement>("#nameInput")!.value;
      const entity: Mx.DomainModels.Entity | undefined = entities.find((e) => e.$ID === entityID);
      if (entity === undefined) {
        ui.showStatus("Select an entity to rename.", "error");
      } else if (newName === null || newName.length === 0) {
        ui.showStatus("Fill in a new name.", "error");
      } else if (newName.match(/^[A-Za-z]\w*$/)) {
        const microflowHelper = new MicroflowHelper(entity, await domainModels.getUnitsInfo(), newName);
        const result: string = await ChangeMicroflowNames(microflowHelper, microflows, appStoreList);
        if (result === "Success") {
          //this is somehow not working.
          entity.name = newName;
          domainModels.save(entity);
          ui.showStatus(`${entity.name} successful`, result);
          entities = await getEntities(domainModels, modulelist, appStoreList);
          ui.populateDropdown(entities, await domainModels.getUnitsInfo());
        }
      } else {
        ui.showStatus("Name contains spaces or illegal characters", "error");
      }
    });
  },
};
