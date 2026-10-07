import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import { PageHelper, type PageDocument } from "../../../../EntityNameChanger/updaters/pages/PageHelper";
import { fakeContext } from "../../helpers/fakes";
import { objectType, stringType } from "../../helpers/microflowBuilders";
import {
  attributeRef,
  directEntityRef,
  element,
  localVariable,
  page,
  type PageSpec,
  pageParameter,
  pageVariable,
  snippet,
  snippetParameter,
  widget,
} from "../../helpers/pageBuilders";

const context = fakeContext();
const QNAME = "MyModule.Order";

function helper() {
  return new PageHelper(context, new NamingPolicy(context.oldName, context.newName, ["OrderLine"]));
}

// Detects, applies and updates usages like the updater does.
function run(doc: PageDocument) {
  const h = helper();
  h.detectParameters(doc);
  h.applyRenames();
  const usages = h.updateUsages(doc);
  return { h, usages };
}

describe("PageHelper.detectParameters", () => {
  it("renames entity parameters whose name contains the entity name", () => {
    const doc = page({ parameters: [pageParameter("Order", objectType(QNAME)), pageParameter("OldOrder", objectType(QNAME))] });
    const { h } = run(doc);
    expect([...h.renames]).toEqual([
      ["Order", "Purchase"],
      ["OldOrder", "OldPurchase"],
    ]);
    expect(doc.parameters.map((p) => p.name)).toEqual(["Purchase", "OldPurchase"]);
  });

  it("leaves parameters of other types alone", () => {
    const doc = page({
      parameters: [pageParameter("Order", stringType()), pageParameter("Order2", objectType("MyModule.OrderLine"))],
    });
    expect(run(doc).h.renames.size).toBe(0);
    expect(doc.parameters.map((p) => p.name)).toEqual(["Order", "Order2"]);
  });

  it("leaves an entity parameter without the entity name alone", () => {
    const doc = page({ parameters: [pageParameter("Customer", objectType(QNAME))] });
    expect(run(doc).h.renames.size).toBe(0);
  });

  it("is case-sensitive", () => {
    const doc = page({ parameters: [pageParameter("order", objectType(QNAME))] });
    expect(run(doc).h.renames.size).toBe(0);
  });

  it.each<[string, PageSpec]>([
    ["another parameter", { parameters: [pageParameter("Purchase", stringType())] }],
    ["a variable", { variables: [localVariable("Purchase")] }],
    ["a widget", { widgets: [widget("Pages$DataView", "Purchase")] }],
  ])("skips a rename onto %s", (_label, spec) => {
    const doc = page({ ...spec, parameters: [pageParameter("Order", objectType(QNAME)), ...(spec.parameters ?? [])] });
    const { h } = run(doc);
    expect(h.renames.size).toBe(0);
    expect(h.skippedRenames).toBe(1);
    expect(doc.parameters[0].name).toBe("Order");
  });

  it("skips a second parameter that would get the same new name", () => {
    const naming = new NamingPolicy("Order", "Item", []);
    const h = new PageHelper(context, naming);
    const doc = page({ parameters: [pageParameter("Order", objectType(QNAME)), pageParameter("Item", objectType(QNAME))] });
    h.detectParameters(doc);
    expect(h.skippedRenames).toBe(1);
  });

  it("renames parameters already typed with the new name", () => {
    const doc = page({ parameters: [pageParameter("Order", objectType("MyModule.Purchase"))] });
    const { h } = run(doc);
    expect([...h.renames]).toEqual([["Order", "Purchase"]]);
  });

  it("handles snippet parameters", () => {
    const doc = snippet({ parameters: [snippetParameter("Order", objectType(QNAME))] });
    run(doc);
    expect(doc.parameters[0].name).toBe("Purchase");
  });

  it("clears state on reset", () => {
    const h = helper();
    h.detectParameters(page({ parameters: [pageParameter("Order", objectType(QNAME))] }));
    h.skippedRenames = 3;
    h.reset();
    expect(h.renames.size).toBe(0);
    expect(h.skippedRenames).toBe(0);
    expect(h.usesEntity(page())).toBe(false);
  });
});

describe("PageHelper.updateUsages", () => {
  type Case = [string, () => Record<string, unknown>, string, unknown, unknown];
  const cases: Case[] = [
    ["xpath source", () => element("Pages$GridXPathSource", { xPathConstraint: "[MyModule.Order_Customer = $Order]" }), "xPathConstraint", "[MyModule.Order_Customer = $Purchase]", undefined],
    ["selector xpath", () => element("Pages$SelectorXPathSource", { xPathConstraint: "[id = $Order]" }), "xPathConstraint", "[id = $Purchase]", undefined],
    ["template parameter", () => element("Pages$ClientTemplateParameter", { expression: "$Order/Name" }), "expression", "$Purchase/Name", undefined],
    ["conditional visibility", () => element("Pages$ConditionalVisibilitySettings", { expression: "$Order/Paid" }), "expression", "$Purchase/Paid", undefined],
    ["validation", () => element("Pages$WidgetValidation", { expression: "$Order/Total > 0" }), "expression", "$Purchase/Total > 0", undefined],
    ["microflow mapping", () => element("Pages$MicroflowParameterMapping", { expression: "$Order", parameter: "MyModule.ACT.Order" }), "expression", "$Purchase", "MyModule.ACT.Order"],
    ["nanoflow mapping", () => element("Pages$NanoflowParameterMapping", { expression: "$Order" }), "expression", "$Purchase", undefined],
    ["page mapping", () => element("Pages$PageParameterMapping", { argument: "$Order", parameter: "MyModule.Other.Order" }), "argument", "$Purchase", "MyModule.Other.Order"],
    ["snippet mapping", () => element("Pages$SnippetParameterMapping", { argument: "$Order", parameter: "MyModule.Snip.Order" }), "argument", "$Purchase", "MyModule.Snip.Order"],
    ["close page", () => element("Pages$ClosePageClientAction", { numberOfPagesToClose: "$Order/Count" }), "numberOfPagesToClose", "$Purchase/Count", undefined],
    ["open page", () => element("Pages$PageClientAction", { numberOfPagesToClose2: "$Order/Count" }), "numberOfPagesToClose2", "$Purchase/Count", undefined],
    ["appearance", () => element("Pages$Appearance", { dynamicClasses: "if $Order/Paid then 'a' else 'b'" }), "dynamicClasses", "if $Purchase/Paid then 'a' else 'b'", undefined],
    ["pluggable expression", () => element("CustomWidgets$WidgetValue", { expression: "$Order/Name" }), "expression", "$Purchase/Name", undefined],
    ["pluggable xpath", () => element("CustomWidgets$WidgetValue", { xPathConstraint: "[x = $Order]" }), "xPathConstraint", "[x = $Purchase]", undefined],
    ["local variable default", () => localVariable("Flag", "$Order/Paid") as unknown as Record<string, unknown>, "defaultValue", "$Purchase/Paid", undefined],
    ["page variable, bare", () => pageVariable({ pageParameter: "Order" }), "pageParameter", "Purchase", undefined],
    ["page variable, qualified", () => pageVariable({ pageParameter: "MyModule.Order_Edit.Order" }), "pageParameter", "MyModule.Order_Edit.Purchase", undefined],
    ["page variable, snippet", () => pageVariable({ snippetParameter: "Order" }), "snippetParameter", "Purchase", undefined],
    ["url segment", () => element("Pages$ParameterAttributeUrlSegment", { pageParameter: "Order", attribute: "MyModule.Order.Id" }), "pageParameter", "Purchase", undefined],
    ["search field default (literal)", () => element("Pages$DropDownSearchField", { defaultValue: "$Order" }), "defaultValue", "$Order", undefined],
    ["other parameter reference", () => pageVariable({ pageParameter: "Customer" }), "pageParameter", "Customer", undefined],
  ];

  it.each(cases)("%s", (_label, build, property, expected, untouchedParameter) => {
    const target = build();
    const doc = page({ parameters: [pageParameter("Order", objectType(QNAME))], widgets: [widget("Pages$DataView", "dv", { nested: [target] })] });
    run(doc);
    expect(target[property]).toBe(expected);
    if (untouchedParameter !== undefined) {
      expect(target.parameter).toBe(untouchedParameter);
    }
  });

  it("rewrites nested pluggable widget objects", () => {
    const value = element("CustomWidgets$WidgetValue", { expression: "$Order/Name" });
    const object = element("CustomWidgets$WidgetObject", {
      properties: [element("CustomWidgets$WidgetProperty", { value: element("CustomWidgets$WidgetValue", { objects: [element("CustomWidgets$WidgetObject", { properties: [element("CustomWidgets$WidgetProperty", { value })] })] }) })],
    });
    const doc = page({ parameters: [pageParameter("Order", objectType(QNAME))], widgets: [widget("CustomWidgets$CustomWidget", "gallery", { object })] });
    run(doc);
    expect(value.expression).toBe("$Purchase/Name");
  });

  it("rewrites the page parameter default value and url placeholders", () => {
    const doc = page({
      url: "/order/{Order/Id}/{Order}/{OrderLine/Id}",
      parameters: [pageParameter("Order", objectType(QNAME), { defaultValue: "$Order" })],
    });
    const { usages } = run(doc);
    expect(doc.url).toBe("/order/{Purchase/Id}/{Purchase}/{OrderLine/Id}");
    expect(doc.parameters[0].defaultValue).toBe("$Purchase");
    expect(usages).toBe(2);
  });

  it("rewrites snippet usages", () => {
    const template = element("Pages$ClientTemplateParameter", { expression: "$Order/Name" });
    const doc = snippet({ parameters: [snippetParameter("Order", objectType(QNAME))], widgets: [widget("Pages$Text", "t", { template })] });
    run(doc);
    expect(template.expression).toBe("$Purchase/Name");
  });

  it("does nothing without renames", () => {
    const target = element("Pages$ClientTemplateParameter", { expression: "$Order/Name" });
    const doc = page({ parameters: [pageParameter("Customer", objectType(QNAME))], widgets: [target] });
    expect(run(doc).usages).toBe(0);
    expect(target.expression).toBe("$Order/Name");
  });
});

describe("PageHelper.usesEntity", () => {
  function uses(doc: PageDocument) {
    const h = helper();
    h.detectParameters(doc);
    return h.usesEntity(doc);
  }

  it.each([
    ["an entity parameter", () => page({ parameters: [pageParameter("Customer", objectType(QNAME))] })],
    ["the legacy parameter", () => page({ parameter: QNAME })],
    ["a data source entity", () => page({ widgets: [widget("Pages$DataView", "dv", { dataSource: element("Pages$DataViewSource", { entityRef: directEntityRef(QNAME) }) })] })],
    ["an association step", () => page({ widgets: [element("DomainModels$EntityRefStep", { association: "MyModule.Line_Order", destinationEntity: QNAME })] })],
    ["an attribute", () => page({ widgets: [widget("Pages$TextBox", "tb", { attributeRef: attributeRef("MyModule.Order.Name") })] })],
    ["a new button", () => page({ widgets: [element("Pages$GridNewButton", { entity: QNAME })] })],
    ["a list view template", () => page({ widgets: [element("Pages$ListViewTemplate", { specialization: QNAME })] })],
    ["a snippet data source", () => snippet({ widgets: [widget("Pages$DataView", "dv", { dataSource: element("Pages$DataViewSource", { entityRef: directEntityRef(QNAME) }) })] })],
  ])("is true for %s", (_label, build) => {
    expect(uses(build())).toBe(true);
  });

  // Units rewritten earlier in the job (or by an earlier partial run) already hold the new qualified name.
  it.each([
    ["an entity parameter", () => page({ parameters: [pageParameter("Customer", objectType("MyModule.Purchase"))] })],
    ["the legacy parameter", () => page({ parameter: "MyModule.Purchase" })],
    ["a data source entity", () => page({ widgets: [element("Pages$DataViewSource", { entityRef: directEntityRef("MyModule.Purchase") })] })],
    ["an attribute", () => page({ widgets: [attributeRef("MyModule.Purchase.Name")] })],
  ])("is true for %s with the new name", (_label, build) => {
    expect(uses(build())).toBe(true);
  });

  it.each([
    ["an empty page", () => page()],
    ["an attribute without an entity", () => page({ widgets: [attributeRef("Name")] })],
    ["another entity", () => page({ widgets: [element("Pages$DataViewSource", { entityRef: directEntityRef("MyModule.OrderLine") })] })],
    ["an attribute of another entity", () => page({ widgets: [attributeRef("MyModule.OrderLine.Name")] })],
  ])("is false for %s", (_label, build) => {
    expect(uses(build())).toBe(false);
  });

  it("decides the document rename on name and usage", () => {
    const h = helper();
    const used = page({ name: "Order_Edit", parameters: [pageParameter("Order", objectType(QNAME))] });
    h.detectParameters(used);
    expect(h.shouldRenameDocument(used)).toBe(true);
    h.reset();
    const unused = page({ name: "Order_Edit" });
    h.detectParameters(unused);
    expect(h.shouldRenameDocument(unused)).toBe(false);
    const otherName = page({ name: "Customer_Edit", parameters: [pageParameter("Order", objectType(QNAME))] });
    h.detectParameters(otherName);
    expect(h.shouldRenameDocument(otherName)).toBe(false);
  });
});
