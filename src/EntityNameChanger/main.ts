import * as Mx from "@mendix/extensions-api";

import * as ui from "./ui";
import { getEntities, getAppstoreModuleNames, getEntityLocation } from "./moduleModel";
import { createRenameContext } from "./framework/RenameContext";
import { DocumentNameRegistry } from "./framework/DocumentNameRegistry";
import { QualifiedNameRenames } from "./framework/QualifiedNameRenames";
import { EntityRenameStep } from "./framework/EntityRenameStep";
import { runRenameJob } from "./framework/RenameJob";
import { createUpdaters } from "./updaters/updaterRegistry";
import { validateNewName } from "./validation";

export const component: Mx.IComponent = {
  async loaded(componentContext: Mx.ComponentContext) {
    //Initialization
    const studioPro = Mx.getStudioProApi(componentContext);
    const model = studioPro.app.model;
    const { domainModels, modules, projects } = model;
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
      const problem = validateNewName(entity, newName);
      if (problem !== null) {
        ui.showStatus(problem, "error");
        // Without a problem the entity is defined; this only narrows the type.
      } else if (entity !== undefined) {
        ui.setBusy(true);
        try {
          const location = getEntityLocation(entity, await domainModels.getUnitsInfo());
          if (location === null) {
            ui.showStatus(`Could not find the module of ${entity.name}.`, "error");
            return;
          }
          const context = createRenameContext({
            entityId: entity.$ID,
            domainModelId: location.domainModelId,
            moduleName: location.moduleName,
            oldName: entity.name,
            newName,
            excludedModules: appStoreList,
            allEntityNames: entities.map((e) => e.name),
          });
          const entityStep = new EntityRenameStep(domainModels, context);
          const problem = await entityStep.validate();
          if (problem !== null) {
            ui.showStatus(problem, "error");
            return;
          }
          const documentNames = DocumentNameRegistry.fromModulesTree(await projects.getModulesTree());
          const groups = createUpdaters(model, {
            context,
            documentNames,
            renames: QualifiedNameRenames.forEntity(context),
            options: { renamePages: ui.isRenamePagesChecked() },
          });
          const { dialog, report } = await runRenameJob(
            {
              planners: groups.planners,
              entityStep,
              updaters: [...groups.renamers, ...groups.referenceUpdaters, ...groups.refreshers],
              runProgress: (title, steps) => studioPro.ui.dialogs.showProgressDialog(title, steps),
            },
            context,
          );
          ui.showReport(dialog, report);
          if (report.entityRenamed) {
            ui.clearNameInput();
            entities = await getEntities(domainModels, modulelist, appStoreList);
            ui.populateDropdown(entities, await domainModels.getUnitsInfo());
          }
        } catch (error: unknown) {
          console.info(`rename failed: ${error}`);
          ui.showStatus(`Rename failed: ${error instanceof Error ? error.message : error}`, "error");
        } finally {
          ui.setBusy(false);
        }
      }
    });
  },
};
