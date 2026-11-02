import { describe, expect, it } from "vitest";
import { MessageDefinitionUsage } from "../../../../NameChanger/framework/MessageDefinitionUsage";
import { NamingPolicy } from "../../../../NameChanger/framework/NamingPolicy";
import { NO_LOCAL_RENAMES } from "../../../../NameChanger/updaters/documents/DocumentUpdater";
import { MessageDefinitionInspector } from "../../../../NameChanger/updaters/documents/MessageDefinitionInspector";
import {
  entityMessageDefinition,
  exposedEntity,
  messageDefinition2,
  messageDefinitionCollection,
} from "../../helpers/documentBuilders";
import { fakeContext } from "../../helpers/fakes";
import { fakeUnitInfo } from "../../../shared/helpers/fakes";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
const naming = new NamingPolicy(context.oldName, context.newName, context.protectedNames);
const inspector = new MessageDefinitionInspector(context, naming, new MessageDefinitionUsage());

describe("MessageDefinitionInspector.usesEntity", () => {
  it("records only the definitions that use the entity", () => {
    const usage = new MessageDefinitionUsage();
    const recording = new MessageDefinitionInspector(context, naming, usage);
    usage.add("MyModule.MD_Messages.Summary", "MyModule.EMM_Summary");
    usage.add("MyModule.MD_Messages.Line", "MyModule.EMM_Line");
    usage.add("MyModule.MD_Order", "MyModule.IMM_Order");
    usage.add("MyModule.MD_Line", "MyModule.IMM_Line");
    const collection = messageDefinitionCollection("MD_Messages", [
      entityMessageDefinition("Summary", exposedEntity("MyModule.Customer", [exposedEntity("MyModule.Order", [], "ExposedAssociation")])),
      entityMessageDefinition("Line", exposedEntity("MyModule.OrderLine")),
    ]);
    expect(recording.usesEntity(collection, fakeUnitInfo("c", "MessageDefinitions$MessageDefinitionCollection", "MyModule", "MD_Messages"))).toBe(true);
    recording.usesEntity(messageDefinition2("MD_Order", exposedEntity("MyModule.Order")), fakeUnitInfo("o", "MessageDefinitions$MessageDefinition2", "MyModule", "MD_Order"));
    recording.usesEntity(messageDefinition2("MD_Line", exposedEntity("MyModule.OrderLine")), fakeUnitInfo("l", "MessageDefinitions$MessageDefinition2", "MyModule", "MD_Line"));
    expect(usage.mappingsOf("MyModule.MD_Messages")).toEqual(["MyModule.EMM_Summary"]);
    expect(usage.mappingsOf("MyModule.MD_Order")).toEqual(["MyModule.IMM_Order"]);
    expect(usage.mappingsOf("MyModule.MD_Line")).toEqual([]);
  });

  it("is true when a definition exposes the entity, old or new name", () => {
    expect(inspector.usesEntity(messageDefinitionCollection("MD_Order", [entityMessageDefinition("Order", exposedEntity("MyModule.Order"))]))).toBe(true);
    expect(inspector.usesEntity(messageDefinition2("MD_Order", exposedEntity("MyModule.Purchase")))).toBe(true);
  });

  it("is true for the entity as a nested association", () => {
    const child = exposedEntity("MyModule.Order", [], "ExposedAssociation");
    expect(inspector.usesEntity(messageDefinition2("MD_Customer", exposedEntity("MyModule.Customer", [child])))).toBe(true);
  });

  it("is false for other entities or no exposed entity", () => {
    expect(inspector.usesEntity(messageDefinition2("MD_Order", exposedEntity("MyModule.OrderLine")))).toBe(false);
    expect(inspector.usesEntity(messageDefinition2("MD_Order", null))).toBe(false);
    expect(inspector.usesEntity(messageDefinitionCollection("MD_Order"))).toBe(false);
  });
});

describe("MessageDefinitionInspector.planLocalRenames", () => {
  it("renames definitions rooted at the entity, for callers too", () => {
    const collection = messageDefinitionCollection("MD", [
      entityMessageDefinition("Order", exposedEntity("MyModule.Order")),
      entityMessageDefinition("OrderLine", exposedEntity("MyModule.OrderLine")),
      entityMessageDefinition("OrderSummary", exposedEntity("MyModule.Customer", [exposedEntity("MyModule.Order", [], "ExposedAssociation")])),
    ]);
    expect(inspector.planLocalRenames(collection)).toEqual({
      renames: new Map([["Order", "Purchase"]]),
      referencedByCallers: true,
      skipped: 0,
    });
  });

  it("skips a definition whose new name is taken in the collection", () => {
    const collection = messageDefinitionCollection("MD", [
      entityMessageDefinition("Order", exposedEntity("MyModule.Order")),
      entityMessageDefinition("Purchase", exposedEntity("MyModule.Customer")),
    ]);
    expect(inspector.planLocalRenames(collection)).toEqual({ renames: new Map(), referencedByCallers: false, skipped: 1 });
  });

  it("has nothing to rename in a standalone definition", () => {
    expect(inspector.planLocalRenames(messageDefinition2("Order", exposedEntity("MyModule.Order")))).toBe(NO_LOCAL_RENAMES);
  });
});

describe("MessageDefinitionInspector.apply", () => {
  it("renames the planned definitions and keeps exposed names", () => {
    const exposed = exposedEntity("MyModule.Order");
    const definition = entityMessageDefinition("Order", exposed);
    const collection = messageDefinitionCollection("MD_Order", [definition]);
    expect(inspector.apply(collection, inspector.planLocalRenames(collection))).toBe(1);
    expect(definition.name).toBe("Purchase");
    expect(exposed.exposedName).toBe("Order");
  });

  it("changes nothing in a standalone definition", () => {
    const document = messageDefinition2("Order", exposedEntity("MyModule.Order"));
    expect(inspector.apply(document, { renames: new Map([["Order", "Purchase"]]), referencedByCallers: true })).toBe(0);
    expect(document.name).toBe("Order");
  });
});
