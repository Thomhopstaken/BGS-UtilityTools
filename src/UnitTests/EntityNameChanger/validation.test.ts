import { describe, expect, it } from "vitest";
import { isReservedName, RESERVED_NAMES, validateNewName } from "../../EntityNameChanger/validation";

const order = { name: "Order" };

describe("validateNewName", () => {
  it("requires an entity", () => {
    expect(validateNewName(undefined, "Purchase")).toBe("Select an entity to rename.");
  });

  it.each([null, ""])("requires a name (%j)", (name) => {
    expect(validateNewName(order, name)).toBe("Fill in a new name.");
  });

  it("rejects the current name", () => {
    expect(validateNewName(order, "Order")).toBe("The new name is the same as the current name.");
  });

  it.each(["New Order", "1Order", "_Order", "Order-2", "Ordér", "Order."])("rejects '%s'", (name) => {
    expect(validateNewName(order, name)).toBe("Name contains spaces or illegal characters");
  });

  it.each(["Object", "object", "OBJECT", "currentuser", "CurrentUser", "mendixobject", "ID", "_", "Type"])(
    "rejects reserved word '%s'",
    (name) => {
      expect(validateNewName(order, name)).toBe(`'${name}' is a reserved word and cannot be used as an entity name.`);
    },
  );

  it.each(["Purchase", "order", "Order_2", "P", "Objects", "TypeOf", "Ids"])("accepts '%s'", (name) => {
    expect(validateNewName(order, name)).toBeNull();
  });
});

describe("isReservedName", () => {
  it("stores every reserved name in lower case", () => {
    expect([...RESERVED_NAMES].every((name) => name === name.toLowerCase())).toBe(true);
    expect(RESERVED_NAMES.size).toBe(69);
  });

  it.each(["while", "WHILE", "MendixObject", "createdDate"])("matches '%s' case-insensitively", (name) => {
    expect(isReservedName(name)).toBe(true);
  });

  it.each(["whiles", "Mendix", ""])("does not match '%s'", (name) => {
    expect(isReservedName(name)).toBe(false);
  });
});
