import {
    ComponentContext,
    IComponent,
    getStudioProApi,
} from "@mendix/extensions-api";
import { registerEntityRenameMenus } from "./NameChanger/contextMenu";

// Extension entry point: registers the panes, the Extensions menu and the domain model context menus.
export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        const studioPro = getStudioProApi(componentContext);

        // uiEntrypoint "namechangerpane" is the bundle built from NameChanger/main.ts
        const nameChangerHandle = await studioPro.ui.panes.register(
            {
                title: "NameChanger",
                initialPosition: "right",
            },
            {
                componentName: "extension/BGS-UtilityTools",
                uiEntrypoint: "namechangerpane",
            },
        );

        // uiEntrypoint "prefixerpane" is the bundle built from PreFixer/main.ts
        // UNVERIFIED: a second uiEntrypoint next to "namechangerpane" loads its own bundle.
        const preFixerHandle = await studioPro.ui.panes.register(
            {
                title: "PreFixer",
                initialPosition: "right",
            },
            {
                componentName: "extension/BGS-UtilityTools",
                uiEntrypoint: "prefixerpane",
            },
        );
        // uiEntrypoint "classsearcherpane" is the bundle built from ClassSearcher/main.ts
        // UNVERIFIED: a third uiEntrypoint loads its own bundle, like the PreFixer's.
        const classSearcherHandle = await studioPro.ui.panes.register(
            {
                title: "ClassSearcher",
                initialPosition: "right",
            },
            {
                componentName: "extension/BGS-UtilityTools",
                uiEntrypoint: "classsearcherpane",
            },
        );
        console.info("panes registered: NameChanger, PreFixer, ClassSearcher");

        // Add a menu item to the Extensions menu
        await studioPro.ui.extensionsMenu.add({
            menuId: "BGS-UtilityTools.MainMenu",
            caption: "BGS-UtilityTools",
            subMenus: [
                {
                    menuId: "BGS-UtilityTools.NameChangerMenu",
                    caption: "NameChanger",
                    action: async () => {
                        await studioPro.ui.panes.open(nameChangerHandle);
                    },
                },
                {
                    menuId: "BGS-UtilityTools.PreFixerMenu",
                    caption: "PreFixer",
                    action: async () => {
                        await studioPro.ui.panes.open(preFixerHandle);
                    },
                },
                {
                    menuId: "BGS-UtilityTools.ClassSearcherMenu",
                    caption: "ClassSearcher",
                    action: async () => {
                        await studioPro.ui.panes.open(classSearcherHandle);
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
            openPane: () => studioPro.ui.panes.open(nameChangerHandle),
            messaging: studioPro.ui.messagePassing,
        });
    },
};
