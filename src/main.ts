import {
    ComponentContext,
    IComponent,
    getStudioProApi,
} from "@mendix/extensions-api";
import { registerEntityRenameMenus } from "./EntityNameChanger/contextMenu";

// Extension entry point: registers the pane, the Extensions menu and the domain model context menus.
export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        const studioPro = getStudioProApi(componentContext);

        // uiEntrypoint "dockablepane" is the bundle built from EntityNameChanger/main.ts
        const panehandle = await studioPro.ui.panes.register(
            {
                title: "Entity Name Changer",
                initialPosition: "right",
            },
            {
                componentName: "extension/BGS-UtilityTools",
                uiEntrypoint: "dockablepane",
            },
        );

        // Add a menu item to the Extensions menu
        await studioPro.ui.extensionsMenu.add({
            menuId: "BGS-UtilityTools.MainMenu",
            caption: "BGS-UtilityTools",
            subMenus: [
                {
                    menuId: "BGS-UtilityTools.ShowMenu",
                    caption: "Entity Name Changer",
                    action: async () => {
                        await studioPro.ui.panes.open(panehandle);
                    },
                },
            ],
        });

        // "Rename entity…" on domain models, in the App Explorer and the domain model editor
        await registerEntityRenameMenus({
            addExplorerMenu: (menu, documentType) => studioPro.ui.appExplorer.addContextMenu(menu, documentType),
            addEditorMenu: (menu, documentType) => studioPro.ui.documents.addContextMenu(menu, documentType),
            moduleOfDomainModel: async (documentId) => {
                const infos = await studioPro.app.model.domainModels.getUnitsInfo();
                return infos.find((info) => info.$ID === documentId)?.moduleName ?? null;
            },
            openPane: () => studioPro.ui.panes.open(panehandle),
            messaging: studioPro.ui.messagePassing,
        });
    },
};
