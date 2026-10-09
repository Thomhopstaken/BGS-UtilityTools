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
    },
};
