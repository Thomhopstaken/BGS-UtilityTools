import { describe, expect, it } from "vitest";
import { MessageDefinitionUsage } from "../../../NameChanger/framework/MessageDefinitionUsage";

describe("MessageDefinitionUsage", () => {
  it("finds mappings of a standalone definition and of definitions inside a collection", () => {
    const usage = new MessageDefinitionUsage();
    usage.add("MyModule.MD_Order", "MyModule.IMM_Order");
    usage.add("MyModule.MD_Messages.Order", "MyModule.EMM_Order");
    usage.add("MyModule.MD_Messages.Customer", "MyModule.IMM_Customer");
    ["MyModule.MD_Order", "MyModule.MD_Messages.Order", "MyModule.MD_Messages.Customer"].forEach((d) => usage.addEntityDefinition(d));
    expect(usage.mappingsOf("MyModule.MD_Order")).toEqual(["MyModule.IMM_Order"]);
    expect(usage.mappingsOf("MyModule.MD_Messages")).toEqual(["MyModule.EMM_Order", "MyModule.IMM_Customer"]);
  });

  it("only lists mappings of definitions that use the entity", () => {
    const usage = new MessageDefinitionUsage();
    usage.add("MyModule.MD_Messages.Order", "MyModule.EMM_Order");
    usage.add("MyModule.MD_Messages.Customer", "MyModule.IMM_Customer");
    usage.add("MyModule.MD_Customer", "MyModule.IMM_Customer2");
    usage.addEntityDefinition("MyModule.MD_Messages.Order");
    expect(usage.mappingsOf("MyModule.MD_Messages")).toEqual(["MyModule.EMM_Order"]);
    expect(usage.mappingsOf("MyModule.MD_Customer")).toEqual([]);
  });

  it("lists a mapping once and ignores prefixes that are no segment", () => {
    const usage = new MessageDefinitionUsage();
    usage.add("MyModule.MD_Order", "MyModule.IMM_Order");
    usage.add("MyModule.MD_Order", "MyModule.IMM_Order");
    usage.add("MyModule.MD_OrderLine", "MyModule.IMM_Line");
    usage.addEntityDefinition("MyModule.MD_Order");
    usage.addEntityDefinition("MyModule.MD_Order");
    usage.addEntityDefinition("MyModule.MD_OrderLine");
    expect(usage.mappingsOf("MyModule.MD_Order")).toEqual(["MyModule.IMM_Order"]);
    expect(usage.mappingsOf("MyModule.Unused")).toEqual([]);
  });
});
