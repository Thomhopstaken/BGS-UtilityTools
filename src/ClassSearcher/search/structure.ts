import type { ElementPlace, ModelElement } from "../../shared/rename/rewrite/elementWalker";

// One row of the result tree below the document: a result's parent widget or the result itself.
export type StructureNode = {
  readonly id: string;
  readonly label: string;
  // Type caption ("Container"); "" when the label already says it ("Row 2").
  readonly type: string;
};

// Studio Pro's names for the common page elements; others get their $Type in words.
const TYPE_CAPTIONS: Readonly<Record<string, string>> = {
  Pages$ActionButton: "Action button",
  Pages$CheckBox: "Check box",
  Pages$DataGrid: "Data grid",
  Pages$DataView: "Data view",
  Pages$DatePicker: "Date picker",
  Pages$DivContainer: "Container",
  Pages$DropDown: "Drop-down",
  Pages$DynamicText: "Text",
  Pages$GridColumn: "Column",
  Pages$GroupBox: "Group box",
  Pages$Header: "Header",
  Pages$Label: "Label",
  Pages$LayoutGrid: "Layout grid",
  Pages$LinkButton: "Link button",
  Pages$ListView: "List view",
  Pages$NavigationList: "Navigation list",
  Pages$NavigationTree: "Navigation tree",
  Pages$Placeholder: "Placeholder",
  Pages$ReferenceSelector: "Reference selector",
  Pages$ScrollContainer: "Scroll container",
  Pages$SnippetCallWidget: "Snippet call",
  Pages$TabContainer: "Tab container",
  Pages$Table: "Table",
  Pages$TemplateGrid: "Template grid",
  Pages$TextArea: "Text area",
  Pages$TextBox: "Text box",
  Pages$Title: "Page title",
};

const CUSTOM_WIDGET = "CustomWidgets$CustomWidget";

// Whether the element has a Class field.
export function hasAppearance(element: ModelElement): boolean {
  return typeof element.appearance === "object" && element.appearance !== null;
}

// A widget that can be a result's parent: it has a Class field and a name. Layout grid rows and columns,
// placeholders, tab pages and pluggable widget slots are never parents (lead, 2026-11-06).
export function isNamedWidget(element: ModelElement): boolean {
  return hasAppearance(element) && typeof element.name === "string" && element.name !== "";
}

// "Container", the pluggable widget's own name ("Data grid 2"), or the $Type in words ("Grid action button").
export function typeCaption(element: ModelElement): string {
  if (element.$Type === CUSTOM_WIDGET) {
    const name = (element.type as { name?: unknown } | null | undefined)?.name;
    return typeof name === "string" && name !== "" ? name : "Pluggable widget";
  }
  return TYPE_CAPTIONS[element.$Type] ?? typeInWords(element.$Type);
}

// "Pages$GridActionButton" -> "Grid action button"
export function typeInWords(type: string): string {
  const words = type.slice(type.indexOf("$") + 1).split(/(?=[A-Z])/).filter((word) => word !== "");
  return words.map((word, i) => (i === 0 ? word : word.toLowerCase())).join(" ");
}

// The row for an element with a Class field: its name and type, or its kind and position ("Row 2").
export function elementNode(place: ElementPlace): StructureNode {
  const { element } = place;
  const position = place.index === undefined ? "" : ` ${place.index + 1}`;
  const id = String(element.$ID);
  switch (element.$Type) {
    case "Pages$LayoutGridRow":
    case "Pages$TableRow":
      return { id, label: `Row${position}`, type: "" };
    case "Pages$LayoutGridColumn":
      return { id, label: `Column${position}`, type: "" };
    case "Pages$TableCell":
      return { id, label: `Cell${position}`, type: "" };
    case "Pages$NavigationListItem":
      return { id, label: `Item${position}`, type: "" };
    case "Pages$ScrollContainerRegion":
      return { id, label: `${capitalize(place.key)} region`, type: "" };
  }
  const name = typeof element.name === "string" ? element.name : "";
  const caption = typeCaption(element);
  return name === "" ? { id, label: caption, type: "" } : { id, label: name, type: caption };
}

// The nearest named widget above an element, or null when there is none and the result sits under the document.
// ancestors[0] is the document itself, which is never a parent.
export function parentNode(ancestors: readonly ElementPlace[]): StructureNode | null {
  for (let i = ancestors.length - 1; i >= 1; i--) {
    if (isNamedWidget(ancestors[i].element)) {
      return elementNode(ancestors[i]);
    }
  }
  return null;
}

function capitalize(text: string): string {
  return text === "" ? text : text[0].toUpperCase() + text.slice(1);
}
