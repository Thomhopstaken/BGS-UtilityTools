import * as Mx from "@mendix/extensions-api";

import * as ui from "./ui";
import { getEntities, getAppstoreModuleNames, getEntityLocation, getEntityNamesInDomainModel } from "./moduleModel";
import { createRenameContext } from "./framework/RenameContext";
import { DocumentNameRegistry } from "./framework/DocumentNameRegistry";
import { QualifiedNameRenames } from "./framework/QualifiedNameRenames";
import { AssociationRenamePlan } from "./framework/AssociationRenamePlan";
import { EntityRenameStep } from "./framework/EntityRenameStep";
import { PrepareStep } from "./framework/PrepareStep";
import { runRenameJob } from "./framework/RenameJob";
import { createUpdaters } from "./updaters/updaterRegistry";
import { findTakenEntityName, validateNewName } from "./validation";

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
    // Kept so a click needs no API call before the progress dialog opens; refreshed after a rename.
    let domainModelInfos = await domainModels.getUnitsInfo();
    ui.populateDropdown(entities, domainModelInfos);
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
        const clicked = Date.now();
        try {
          const location = getEntityLocation(entity, domainModelInfos);
          if (location === null) {
            ui.showStatus(`Could not find the module of ${entity.name}.`, "error");
            return;
          }
          const taken = findTakenEntityName(
            getEntityNamesInDomainModel(entities, location.domainModelId),
            location.moduleName,
            newName,
          );
          if (taken !== null) {
            ui.showStatus(taken, "error");
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
          const associationPlan = new AssociationRenamePlan();
          const entityStep = new EntityRenameStep(domainModels, context, associationPlan);
          // Filled by the prepare step inside the dialog.
          const documentNames = new DocumentNameRegistry();
          const prepare = new PrepareStep({
            validate: () => entityStep.validate(),
            getModulesTree: () => projects.getModulesTree(),
            documentNames,
          });
          const groups = createUpdaters(model, {
            context,
            documentNames,
            renames: QualifiedNameRenames.forEntity(context),
            associationPlan,
            options: { renamePages: ui.isRenamePagesChecked() },
          });
          const { dialog, report } = await runRenameJob(
            {
              prepare,
              planners: groups.planners,
              entityStep,
              updaters: [...groups.renamers, ...groups.referenceUpdaters, ...groups.refreshers],
              runProgress: (title, steps) => {
                console.info(`opening progress dialog ${Date.now() - clicked} ms after the click`);
                return studioPro.ui.dialogs.showProgressDialog(title, steps);
              },
            },
            context,
          );
          ui.showReport(dialog, report);
          if (report.entityRenamed) {
            ui.clearNameInput();
            entities = await getEntities(domainModels, modulelist, appStoreList);
            domainModelInfos = await domainModels.getUnitsInfo();
            ui.populateDropdown(entities, domainModelInfos);
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
