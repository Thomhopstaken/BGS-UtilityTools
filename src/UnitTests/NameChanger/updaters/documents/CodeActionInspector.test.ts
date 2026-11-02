import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../NameChanger/framework/NamingPolicy";
import { CodeActionInspector } from "../../../../NameChanger/updaters/documents/CodeActionInspector";
import { NO_LOCAL_RENAMES } from "../../../../NameChanger/updaters/documents/DocumentUpdater";
import { codeList, codeParameter, concreteEntity, javaAction, javaScriptAction } from "../../helpers/documentBuilders";
import { fakeContext } from "../../helpers/fakes";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
const inspector = new CodeActionInspector(context, new NamingPolicy(context.oldName, context.newName, context.protectedNames));

const stringParameter = (name: string) => codeParameter(name, { $Type: "CodeActions$StringType" });
const typeParameterParameter = (name: string) => ({
  $Type: "JavaActions$JavaActionParameter",
  name,
  actionParameterType: { $Type: "CodeActions$EntityTypeParameterType", typeParameter: "T" },
});

describe("CodeActionInspector.usesEntity", () => {
  it("is true for a return type of the entity, or a list of it", () => {
    expect(inspector.usesEntity(javaAction("JA", [], concreteEntity("MyModule.Order")))).toBe(true);
    expect(inspector.usesEntity(javaScriptAction("JS", [], codeList(concreteEntity("MyModule.Purchase"))))).toBe(true);
  });

  it("is true for a parameter of the entity's type", () => {
    expect(inspector.usesEntity(javaAction("JA", [codeParameter("P", codeList(concreteEntity("MyModule.Order")))]))).toBe(true);
  });

  it("is false for other entities, type parameters and primitives", () => {
    expect(inspector.usesEntity(javaAction("JA_Order", [codeParameter("Order", concreteEntity("MyModule.OrderLine"))]))).toBe(false);
    expect(inspector.usesEntity(javaAction("JA_Order", [typeParameterParameter("Order"), stringParameter("Order")]))).toBe(false);
  });
});

describe("CodeActionInspector.planLocalRenames", () => {
  it("renames parameters of the entity's type named after it, for callers too", () => {
    const action = javaAction("JA", [
      codeParameter("Order", concreteEntity("MyModule.Order")),
      codeParameter("OrderList", codeList(concreteEntity("MyModule.Order"))),
      codeParameter("OrderLine", concreteEntity("MyModule.OrderLine")),
      stringParameter("OrderId"),
    ]);
    expect(inspector.planLocalRenames(action)).toEqual({
      renames: new Map([
        ["Order", "Purchase"],
        ["OrderList", "PurchaseList"],
      ]),
      referencedByCallers: true,
      skipped: 0,
    });
  });

  it("skips a parameter whose new name is taken", () => {
    const action = javaScriptAction("JS", [codeParameter("Order", concreteEntity("MyModule.Order")), stringParameter("Purchase")]);
    expect(inspector.planLocalRenames(action)).toEqual({ renames: new Map(), referencedByCallers: false, skipped: 1 });
  });

  it("has nothing to rename without a matching parameter", () => {
    expect(inspector.planLocalRenames(javaAction("JA", [], concreteEntity("MyModule.Order")))).toBe(NO_LOCAL_RENAMES);
  });
});

describe("CodeActionInspector.apply", () => {
  it("renames the planned parameters", () => {
    const parameter = codeParameter("Order", concreteEntity("MyModule.Order"));
    const action = javaAction("JA", [parameter, stringParameter("Note")]);
    expect(inspector.apply(action, inspector.planLocalRenames(action))).toBe(1);
    expect(parameter.name).toBe("Purchase");
  });
});
