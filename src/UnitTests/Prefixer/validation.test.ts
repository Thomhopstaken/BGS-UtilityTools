import { describe, expect, it } from "vitest";
import { PREFIX_PATTERN, validateNewPrefix, validatePrefixRequest } from "../../Prefixer/validation";

describe("validateNewPrefix", () => {
  it("accepts 1 to 4 capital letters", () => {
    expect(validateNewPrefix("ACT", "S")).toBeNull();
    expect(validateNewPrefix("ACT", "SUBS")).toBeNull();
  });

  it.each([
    ["", "Enter a new prefix, or tick Remove prefix."],
    ["SUBMIT", "A prefix has at most 4 letters."],
    ["sub", "Use capital letters A–Z only."],
    ["Sub", "Use capital letters A–Z only."],
    ["SU2", "Use capital letters A–Z only."],
    ["S_B", "Use capital letters A–Z only."],
    ["ÄCT", "Use capital letters A–Z only."],
    ["ACT", "The new prefix is the same as the current prefix."],
  ])("rejects '%s'", (newPrefix, message) => {
    expect(validateNewPrefix("ACT", newPrefix)).toBe(message);
  });

  it("uses the same pattern as an existing prefix", () => {
    expect(PREFIX_PATTERN.test("ABCD")).toBe(true);
    expect(PREFIX_PATTERN.test("ABCDE")).toBe(false);
  });
});

describe("validatePrefixRequest", () => {
  it("requires a selected prefix", () => {
    expect(validatePrefixRequest({ oldPrefix: undefined, newPrefix: "SUB", removePrefix: false })).toEqual({
      field: "prefix",
      message: "Select a prefix.",
    });
    expect(validatePrefixRequest({ oldPrefix: undefined, newPrefix: "", removePrefix: true })?.field).toBe("prefix");
  });

  it("points a bad new prefix to its field", () => {
    expect(validatePrefixRequest({ oldPrefix: "ACT", newPrefix: "ACT", removePrefix: false })).toEqual({
      field: "newPrefix",
      message: "The new prefix is the same as the current prefix.",
    });
  });

  it("ignores the new prefix when removing", () => {
    expect(validatePrefixRequest({ oldPrefix: "ACT", newPrefix: "", removePrefix: true })).toBeNull();
    expect(validatePrefixRequest({ oldPrefix: "ACT", newPrefix: "bad!", removePrefix: true })).toBeNull();
  });

  it("passes a valid request", () => {
    expect(validatePrefixRequest({ oldPrefix: "ACT", newPrefix: "SUB", removePrefix: false })).toBeNull();
  });
});
