import { describe, expect, it } from "vitest";
import { isReservedName, RESERVED_NAMES } from "../../../shared/rename/names";

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
