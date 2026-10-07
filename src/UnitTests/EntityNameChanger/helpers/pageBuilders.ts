import type { DataTypes, Pages } from "@mendix/extensions-api";

// Test-only builders for page and snippet shapes; plain objects cast to the Mendix types.

type Props = Record<string, unknown>;

let nextId = 0;
const newId = (prefix: string) => `${prefix}-${++nextId}`;

export function element(type: string, props: Props = {}): Props {
  return { $Type: type, $ID: newId(type), ...props };
}

export function pageParameter(name: string, parameterType: DataTypes.DataType, props: Props = {}): Pages.PageParameter {
  return element("Pages$PageParameter", {
    name,
    parameterType,
    defaultValue: null,
    isRequired: true,
    ...props,
  }) as unknown as Pages.PageParameter;
}

export function snippetParameter(name: string, parameterType: DataTypes.DataType): Pages.SnippetParameter {
  return element("Pages$SnippetParameter", { name, parameterType }) as unknown as Pages.SnippetParameter;
}

export function localVariable(name: string, defaultValue: string | null = null): Pages.LocalVariable {
  return element("Pages$LocalVariable", {
    name,
    defaultValue,
    variableType: { $Type: "DataTypes$BooleanType" },
  }) as unknown as Pages.LocalVariable;
}

export function widget(type: string, name: string, props: Props = {}): Props {
  return element(type, { name, ...props });
}

export function pageVariable(props: Props = {}): Props {
  return element("Pages$PageVariable", {
    localVariable: null,
    pageParameter: null,
    snippetParameter: null,
    widget: null,
    subKey: "",
    useAllPages: false,
    ...props,
  });
}

export function directEntityRef(entity: string): Props {
  return element("DomainModels$DirectEntityRef", { entity });
}

export function attributeRef(attribute: string): Props {
  return element("DomainModels$AttributeRef", { attribute, entityRef: null });
}

export type PageSpec = {
  name?: string;
  parameters?: Pages.PageParameter[];
  variables?: Pages.LocalVariable[];
  widgets?: Props[];
  url?: string;
  parameter?: string;
};

export function page(spec: PageSpec = {}): Pages.Page {
  return element("Pages$Page", {
    name: spec.name ?? "Test_Page",
    parameters: spec.parameters ?? [],
    variables: spec.variables ?? [],
    parameter: spec.parameter ?? "",
    url: spec.url ?? "",
    layoutCall: element("Pages$LayoutCall", {
      layout: "Atlas_Core.Atlas_Default",
      arguments: [element("Pages$LayoutCallArgument", { parameter: "Main", widgets: spec.widgets ?? [] })],
    }),
  }) as unknown as Pages.Page;
}

export type SnippetSpec = {
  name?: string;
  parameters?: Pages.SnippetParameter[];
  variables?: Pages.LocalVariable[];
  widgets?: Props[];
};

export function snippet(spec: SnippetSpec = {}): Pages.Snippet {
  return element("Pages$Snippet", {
    name: spec.name ?? "Test_Snippet",
    parameters: spec.parameters ?? [],
    variables: spec.variables ?? [],
    widgets: spec.widgets ?? [],
  }) as unknown as Pages.Snippet;
}
