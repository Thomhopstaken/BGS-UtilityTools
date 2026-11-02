import * as Mx from "@mendix/extensions-api";

import { injectStyles, mountPane } from "../shared/design/pane";
import { applyTheme } from "../shared/design/theme";
import { NameChangerPane } from "./NameChangerPane";
import { loadPaneData } from "./moduleModel";
import { connectPane } from "./paneMessages";
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
    const pane = new NameChangerPane(view, {
      loadData: () => loadPaneData(model.modules, model.domainModels),
      rename: (request, scope) =>
        runEntityRename(
          { ...scope, model, runProgress: (title, steps) => studioPro.ui.dialogs.showProgressDialog(title, steps) },
          request,
        ),
      // UNVERIFIED: editDocument accepts the unit $ID from getUnitsInfo, and the entity $ID as element.
      openDocument: (target) =>
        target.elementId === undefined
          ? studioPro.ui.editors.editDocument({ id: target.documentId })
          : studioPro.ui.editors.editDocument({ id: target.documentId }, { id: target.elementId }),
      // UNVERIFIED: a message box can be asked from a dockable pane; "warning" shows Yes and No.
      confirm: (question) => studioPro.ui.messageBoxes.ask({ type: "warning", question }),
    });
    view.onSubmit(() => void pane.submit());
    view.onOpenDocument((target) => void pane.openDocument(target));
    view.onModuleChange((moduleName) => pane.selectModule(moduleName));
    view.onClearLog(() => pane.clearLog());
    await pane.load();
    await connectPane(studioPro.ui.messagePassing, (moduleName) => pane.preselectModule(moduleName));
  },
};
