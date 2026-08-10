import {
    ComponentContext,
    IComponent,
    getStudioProApi,
} from "@mendix/extensions-api";

export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        const studioPro = getStudioProApi(componentContext);

        const panehandle = await studioPro.ui.panes.register(
            {
                title: "EntityNameChanger",
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
                    caption: "EntityNameChanger",
                    action: async () => {
                        await studioPro.ui.panes.open(panehandle);
                    },
                },
            ],
        });
    },
};
