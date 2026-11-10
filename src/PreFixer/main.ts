import * as Mx from "@mendix/extensions-api";

import { injectStyles, mountPane } from "../shared/design/pane";
import { applyTheme } from "../shared/design/theme";
import { RenamedDocumentNames } from "../shared/rename/RenamedDocumentNames";
import { PreFixerPane } from "./PreFixerPane";
import { loadPreFixerData } from "./prefixModel";
import { runPrefixRename } from "./prefixService";
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
    // Lives as long as the pane: the modules tree keeps old names after an API rename.
    const renamedNames = new RenamedDocumentNames();
    const pane = new PreFixerPane(view, {
      loadData: () => loadPreFixerData(model.projects, renamedNames),
      rename: (change, scope) =>
        runPrefixRename(
          { ...scope, model, renamedNames, runProgress: (title, steps) => studioPro.ui.dialogs.showProgressDialog(title, steps) },
          change,
        ),
      // UNVERIFIED: editDocument opens every document type by its unit $ID.
      openDocument: (target) => studioPro.ui.editors.editDocument({ id: target.documentId }),
      // UNVERIFIED: a message box can be asked from a dockable pane; "warning" shows Yes and No.
      confirm: (question) => studioPro.ui.messageBoxes.ask({ type: "warning", question }),
    });
    view.onSubmit(() => void pane.submit());
    view.onChange(() => pane.updatePreview());
    view.onOpenDocument((target) => void pane.openDocument(target));
    view.onClearLog(() => pane.clearLog());
    await pane.load();
  },
};
