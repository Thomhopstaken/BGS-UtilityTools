import * as Mx from "@mendix/extensions-api";

import { injectStyles, mountPane } from "../shared/design/pane";
import { applyTheme } from "../shared/design/theme";
import { EntityNameChangerPane } from "./EntityNameChangerPane";
import { loadPaneData } from "./moduleModel";
import { runEntityRename } from "./renameService";
import markup from "./ui/pane.html";
import { PaneView } from "./ui/PaneView";

// Wiring only: Studio Pro APIs in, DOM view and pane controller out.
export const component: Mx.IComponent = {
  async loaded(componentContext: Mx.ComponentContext) {
    const studioPro = Mx.getStudioProApi(componentContext);
    const model = studioPro.app.model;

    injectStyles(document);
    applyTheme(document, await studioPro.ui.preferences.getPreferences());
    const view = new PaneView(mountPane(document, markup));
    const pane = new EntityNameChangerPane(view, {
      loadData: () => loadPaneData(model.modules, model.domainModels),
      rename: (request, scope) =>
        runEntityRename(
          { ...scope, model, runProgress: (title, steps) => studioPro.ui.dialogs.showProgressDialog(title, steps) },
          request,
        ),
    });
    view.onSubmit(() => void pane.submit());
    view.onModuleChange((moduleName) => pane.selectModule(moduleName));
    view.onClearLog(() => pane.clearLog());
    await pane.load();
  },
};
