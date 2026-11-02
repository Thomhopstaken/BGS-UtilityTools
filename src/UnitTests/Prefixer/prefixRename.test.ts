import { describe, expect, it } from "vitest";
import { describeChange, documentNameProblem, prefixOf, renameWithPrefix } from "../../Prefixer/prefixRename";

describe("prefixOf", () => {
  it.each([
    ["ACT_Order_Save", "ACT"],
    ["ACT_Order_Save_All", "ACT"],
    ["A_Order_Save", "A"],
    ["ABCD_Order_Save", "ABCD"],
    ["ACT__Save", "ACT"],
    ["ACT_Order_", "ACT"],
    ["ACT_Save", "ACT"],
    ["CON_1", "CON"],
  ])("%s has prefix %s", (name, prefix) => {
    expect(prefixOf(name)).toBe(prefix);
  });

  it.each([
    ["ACT_", "nothing after the underscore"],
    ["OrderSave", "no underscore"],
    ["ABCDE_Order_Save", "five letters"],
    ["Act_Order_Save", "lower case letters"],
    ["act_Order_Save", "all lower case"],
    ["V2_Order_Save", "a digit"],
    ["_ACT_Order_Save", "a leading underscore"],
    ["", "an empty name"],
  ])("%s has no prefix (%s)", (name) => {
    expect(prefixOf(name)).toBeNull();
  });
});

describe("renameWithPrefix", () => {
  const change = { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" };

  it("replaces the prefix", () => {
    expect(renameWithPrefix("ACT_Order_Save", change)).toBe("SUB_Order_Save");
    expect(renameWithPrefix("ACT_Order_Save_All", { ...change, newPrefix: "X" })).toBe("X_Order_Save_All");
  });

  it("removes the prefix and its underscore", () => {
    expect(renameWithPrefix("ACT_Order_Save", { ...change, newPrefix: null })).toBe("Order_Save");
    expect(renameWithPrefix("ACT_Save", { ...change, newPrefix: null })).toBe("Save");
  });

  it("renames a name with one underscore", () => {
    expect(renameWithPrefix("ACT_Save", change)).toBe("SUB_Save");
  });

  it("is null for a name without the old prefix, exact case", () => {
    expect(renameWithPrefix("SUB_Order_Save", change)).toBeNull();
    expect(renameWithPrefix("ACT_", change)).toBeNull();
    expect(renameWithPrefix("Act_Order_Save", change)).toBeNull();
    expect(renameWithPrefix("ACTS_Order_Save", change)).toBeNull();
  });

  it("can leave a name that is not valid, which documentNameProblem reports", () => {
    expect(renameWithPrefix("ACT_1Order_Save", { ...change, newPrefix: null })).toBe("1Order_Save");
    expect(renameWithPrefix("ACT__Save", { ...change, newPrefix: null })).toBe("_Save");
  });
});

describe("describeChange", () => {
  it("names both prefixes, or the removal", () => {
    expect(describeChange({ group: "flows", oldPrefix: "ACT", newPrefix: "SUB" })).toBe("ACT_ → SUB_");
    expect(describeChange({ group: "flows", oldPrefix: "ACT", newPrefix: null })).toBe("remove ACT_");
  });
});

describe("documentNameProblem", () => {
  it("accepts names Studio Pro accepts", () => {
    expect(documentNameProblem("Order_Save")).toBeNull();
    expect(documentNameProblem("SUB_Order_Save2")).toBeNull();
  });

  it("rejects empty, invalid and reserved names", () => {
    expect(documentNameProblem("")).toBe("the new name would be empty");
    expect(documentNameProblem("1Order_Save")).toContain("must start with a letter");
    expect(documentNameProblem("_Save")).toContain("must start with a letter");
    expect(documentNameProblem("Order-Save")).toContain("only letters, digits and underscores");
    expect(documentNameProblem("While")).toBe("'While' is a reserved word");
  });
});
