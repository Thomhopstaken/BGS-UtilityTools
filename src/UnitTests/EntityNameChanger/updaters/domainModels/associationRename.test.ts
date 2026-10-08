import type { DomainModels } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { NamingPolicy } from "../../../../EntityNameChanger/framework/NamingPolicy";
import {
  AssociationNames,
  applyAssociationRenames,
  associationsOf,
  isConnectedAssociation,
  proposedAssociationName,
} from "../../../../EntityNameChanger/updaters/domainModels/associationRename";
import { association, crossAssociation, domainModelWith } from "../../helpers/domainModelBuilders";
import { fakeContext } from "../../helpers/fakes";

const context = fakeContext({ allEntityNames: ["Order", "OrderLine", "Customer"] });
const naming = new NamingPolicy(context.oldName, context.newName, context.protectedNames);
const asAssociation = (a: unknown) => a as DomainModels.Association;

describe("associationsOf", () => {
  it("returns associations and cross associations", () => {
    const a = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    const c = crossAssociation("a2", "Order_Invoice", "MyModule.Order", "Other.Invoice");
    expect(associationsOf(domainModelWith("dm-1", { associations: [a], crossAssociations: [c] }))).toEqual([a, c]);
  });

  it("handles missing lists", () => {
    expect(associationsOf({ $ID: "dm" } as unknown as DomainModels.DomainModel)).toEqual([]);
  });
});

describe("isConnectedAssociation", () => {
  it("matches the entity by old or new qualified name, as parent or child", () => {
    expect(isConnectedAssociation(asAssociation(association("a", "X", "MyModule.Order", "MyModule.Customer")), context)).toBe(true);
    expect(isConnectedAssociation(asAssociation(association("a", "X", "MyModule.Customer", "MyModule.Purchase")), context)).toBe(true);
  });

  it("matches the entity by id", () => {
    expect(isConnectedAssociation(asAssociation(association("a", "X", "entity-1", "other-id")), context)).toBe(true);
  });

  it("ignores other entities, including ones whose name contains the entity name", () => {
    expect(isConnectedAssociation(asAssociation(association("a", "X", "MyModule.OrderLine", "MyModule.Customer")), context)).toBe(false);
    expect(isConnectedAssociation(asAssociation(association("a", "X", "Other.Order", "MyModule.Customer")), context)).toBe(false);
  });
});

describe("proposedAssociationName", () => {
  it("renames a connected association", () => {
    const a = asAssociation(association("a", "Order_Customer", "MyModule.Order", "MyModule.Customer"));
    expect(proposedAssociationName(a, context, naming)).toBe("Purchase_Customer");
  });

  it("keeps protected entity names", () => {
    const a = asAssociation(association("a", "OrderLine_Order", "MyModule.OrderLine", "MyModule.Order"));
    expect(proposedAssociationName(a, context, naming)).toBe("OrderLine_Purchase");
  });

  it("returns null for an unconnected association or an unchanged name", () => {
    expect(proposedAssociationName(asAssociation(association("a", "Customer_LastOrder", "MyModule.Customer", "MyModule.Invoice")), context, naming)).toBeNull();
    expect(proposedAssociationName(asAssociation(association("a", "Customer_Link", "MyModule.Customer", "MyModule.Order")), context, naming)).toBeNull();
  });
});

describe("AssociationNames", () => {
  it("takes association, cross association and entity names", () => {
    const model = domainModelWith("dm-2", {
      entities: ["Invoice"],
      associations: [association("a1", "Invoice_Line", "Other.Invoice", "Other.Line")],
      crossAssociations: [crossAssociation("a2", "Invoice_Order", "Other.Invoice", "MyModule.Order")],
    });
    const names = new AssociationNames(model, context);
    expect(names.isFree("Invoice")).toBe(false);
    expect(names.isFree("Invoice_Line")).toBe(false);
    expect(names.isFree("Invoice_Order")).toBe(false);
    expect(names.isFree("Invoice_Purchase")).toBe(true);
    expect(names.isFree("Purchase")).toBe(true);
  });

  it("takes the entity's new name in its own domain model", () => {
    const names = new AssociationNames(domainModelWith(context.domainModelId, { entities: ["Order"] }), context);
    expect(names.isFree("Purchase")).toBe(false);
    expect(names.isFree("Order")).toBe(false);
  });

  it("register frees the old name and takes the new one", () => {
    const names = new AssociationNames(domainModelWith("dm-2", { associations: [association("a1", "A", "x", "y")] }), context);
    names.register("A", "B");
    expect(names.isFree("A")).toBe(true);
    expect(names.isFree("B")).toBe(false);
  });
});

describe("applyAssociationRenames", () => {
  it("renames planned associations and returns what changed", () => {
    const a = association("a1", "Order_Customer", "MyModule.Order", "MyModule.Customer");
    const c = crossAssociation("a2", "Order_Invoice", "MyModule.Order", "Other.Invoice");
    const other = association("a3", "Customer_Address", "MyModule.Customer", "MyModule.Address");
    const model = domainModelWith("dm-1", { associations: [a, other], crossAssociations: [c] });
    const applied = applyAssociationRenames(
      model,
      new Map([
        ["a1", "Purchase_Customer"],
        ["a2", "Purchase_Invoice"],
        ["missing", "Gone"],
      ]),
    );
    expect(applied).toEqual([
      { id: "a1", oldName: "Order_Customer", newName: "Purchase_Customer" },
      { id: "a2", oldName: "Order_Invoice", newName: "Purchase_Invoice" },
    ]);
    expect([a.name, c.name, other.name]).toEqual(["Purchase_Customer", "Purchase_Invoice", "Customer_Address"]);
  });

  it("skips an association that already has the new name", () => {
    const a = association("a1", "Purchase_Customer", "MyModule.Purchase", "MyModule.Customer");
    expect(applyAssociationRenames(domainModelWith("dm-1", { associations: [a] }), new Map([["a1", "Purchase_Customer"]]))).toEqual([]);
  });
});
