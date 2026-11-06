import * as Mx from "@mendix/extensions-api";

import { injectStyles, mountPane } from "../shared/design/pane";
import { applyTheme } from "../shared/design/theme";
import type { UnitAccess } from "../shared/rename/types";
import { ClassSearcherPane } from "./ClassSearcherPane";
import { openTarget } from "./openTarget";
import { searchClass } from "./search/classSearch";
import markup from "./ui/pane.html";
import { PaneView } from "./ui/PaneView";

type Documents = UnitAccess<Mx.Primitives.UnitBase>;

// Wiring only: Studio Pro APIs in, DOM view and pane controller out.
export const component: Mx.IComponent = {
  async loaded(componentContext: Mx.ComponentContext) {
    const studioPro = Mx.getStudioProApi(componentContext);
    const model = studioPro.app.model;
    const editors = studioPro.ui.editors;

    injectStyles(document);
    applyTheme(document, await studioPro.ui.preferences.getPreferences());
    const view = new PaneView(mountPane(document, markup));
    const searchModel = {
      modules: model.modules,
      documents: {
        page: model.pages as unknown as Documents,
        snippet: model.snippets as unknown as Documents,
        layout: model.layouts as unknown as Documents,
        buildingBlock: model.buildingBlocks as unknown as Documents,
        pageTemplate: model.pageTemplates as unknown as Documents,
      },
    };
    const pane = new ClassSearcherPane(view, {
      search: (className) => searchClass(searchModel, className),
      open: (target) =>
        openTarget(
          {
            openDocument: (documentId) => editors.editDocument({ id: documentId }),
            // UNVERIFIED: the element overload focuses a page widget by its $ID (only used for entities so far).
            focusElement: (documentId, elementId) => editors.editDocument({ id: documentId }, { id: elementId }),
          },
          target,
        ),
    });
    view.onSubmit(() => void pane.submit());
    view.onOpen((target) => void pane.open(target));
    view.onClear(() => pane.clear());
    console.info("class searcher pane ready");
  },
};
