import { element, page, widget } from "../../NameChanger/helpers/pageBuilders";

// Test-only builders for elements with a Class field, on top of the NameChanger page builders.

type Props = Record<string, unknown>;

export function appearance(cls = "", dynamicClasses: string | null = null): Props {
  return element("Pages$Appearance", { class: cls, dynamicClasses, style: "", designProperties: [] });
}

export function container(name: string, cls = "", widgets: Props[] = [], dynamicClasses: string | null = null): Props {
  return widget("Pages$DivContainer", name, { appearance: appearance(cls, dynamicClasses), widgets });
}

export function layoutGrid(name: string, rows: Props[]): Props {
  return widget("Pages$LayoutGrid", name, { appearance: appearance(), rows });
}

export function gridRow(columns: Props[], cls = ""): Props {
  return element("Pages$LayoutGridRow", { appearance: appearance(cls), columns });
}

export function gridColumn(widgets: Props[], cls = ""): Props {
  return element("Pages$LayoutGridColumn", { appearance: appearance(cls), widgets, weight: 6 });
}

export function tabContainer(name: string, tabPages: Props[]): Props {
  return widget("Pages$TabContainer", name, { appearance: appearance(), tabPages });
}

export function tabPage(name: string, widgets: Props[]): Props {
  return element("Pages$TabPage", { name, widgets, caption: element("Texts$Text", { translations: [] }) });
}

// A page whose own Class field is cls.
export function styledPage(widgets: Props[], cls = ""): Props {
  return Object.assign(page({ widgets }) as unknown as Props, { appearance: appearance(cls) });
}

export function layout(name: string, widgets: Props[], cls = ""): Props {
  return element("Pages$Layout", {
    name,
    appearance: appearance(cls),
    parameters: [],
    content: element("Pages$WebLayoutContent", { widgets, layoutCall: null }),
  });
}

export function buildingBlock(name: string, widgets: Props[]): Props {
  return element("Pages$BuildingBlock", { name, widgets });
}

export function pageTemplate(name: string, widgets: Props[]): Props {
  return element("Pages$PageTemplate", {
    name,
    appearance: appearance(),
    layoutCall: element("Pages$LayoutCall", {
      layout: "Atlas_Core.Atlas_Default",
      arguments: [element("Pages$LayoutCallArgument", { parameter: "Main", widgets })],
    }),
  });
}

// A Data grid 2 like pluggable widget: a "Columns" list property whose items have a "Custom content" widget slot.
export function dataGrid2(name: string, columns: Props[][]): Props {
  const content = element("CustomWidgets$WidgetPropertyType", {
    key: "content",
    caption: "Custom content",
    valueType: element("CustomWidgets$WidgetValueType", { objectType: null }),
  });
  const columnsType = element("CustomWidgets$WidgetPropertyType", {
    key: "columns",
    caption: "Columns",
    valueType: element("CustomWidgets$WidgetValueType", {
      objectType: element("CustomWidgets$WidgetObjectType", { propertyTypes: [content] }),
    }),
  });
  const property = (propertyType: Props, value: Props) => element("CustomWidgets$WidgetProperty", { type: propertyType.$ID, value });
  const value = (props: Props) => element("CustomWidgets$WidgetValue", { widgets: [], objects: [], expression: null, ...props });
  const items = columns.map((widgets) => element("CustomWidgets$WidgetObject", { type: null, properties: [property(content, value({ widgets }))] }));
  return widget("CustomWidgets$CustomWidget", name, {
    appearance: appearance(),
    type: element("CustomWidgets$CustomWidgetType", {
      name: "Data grid 2",
      widgetId: "com.mendix.widget.web.datagrid.Datagrid",
      objectType: element("CustomWidgets$WidgetObjectType", { propertyTypes: [columnsType] }),
    }),
    object: element("CustomWidgets$WidgetObject", { type: null, properties: [property(columnsType, value({ objects: items }))] }),
  });
}
