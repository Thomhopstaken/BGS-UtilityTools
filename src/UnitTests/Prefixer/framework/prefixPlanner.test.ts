import { describe, expect, it } from "vitest";
import { planPrefixRenames, type PrefixPlanInput } from "../../../Prefixer/framework/prefixPlanner";
import type { AppDocument } from "../../../Prefixer/prefixModel";
import { DocumentNameRegistry } from "../../../shared/rename/DocumentNameRegistry";
import { appDocument, MF, NF } from "../helpers/fakeModel";

const change = { group: "flows", oldPrefix: "ACT", newPrefix: "SUB" };

// Every candidate is listed by its API; other names of module M can be added.
function input(candidates: AppDocument[], overrides: Partial<PrefixPlanInput> = {}, otherNames: string[] = []): PrefixPlanInput {
  const names = DocumentNameRegistry.fromModulesTree([
    { name: "M", documents: [...candidates.map((c) => ({ name: c.name })), ...otherNames.map((name) => ({ name }))] },
  ]);
  const listed = new Map<string, Set<string>>();
  for (const c of candidates) {
    listed.set(c.$Type, new Set([...(listed.get(c.$Type) ?? []), c.$ID]));
  }
  return { candidates, change, names, reservedNames: new Map(), marketplaceReferences: new Map(), listed, ...overrides };
}

const save = appDocument("mf-1", MF, "ACT_Order_Save");
const show = appDocument("nf-1", NF, "ACT_Order_Show");

describe("planPrefixRenames", () => {
  it("renames every candidate and registers the new names", () => {
    const planInput = input([save, show]);
    expect(planPrefixRenames(planInput)).toEqual([
      { kind: "rename", document: save, newName: "SUB_Order_Save" },
      { kind: "rename", document: show, newName: "SUB_Order_Show" },
    ]);
    expect(planInput.names.isFree("M", "SUB_Order_Save")).toBe(false);
    expect(planInput.names.isFree("M", "ACT_Order_Save")).toBe(true);
  });

  it("removes the prefix", () => {
    expect(planPrefixRenames({ ...input([save]), change: { ...change, newPrefix: null } })).toEqual([
      { kind: "rename", document: save, newName: "Order_Save" },
    ]);
  });

  it("skips a candidate without the old prefix", () => {
    const [decision] = planPrefixRenames(input([appDocument("x", MF, "SUB_Order_Save")]));
    expect(decision).toMatchObject({ kind: "skip", newName: null, reason: "has no prefix ACT_" });
  });

  it("skips a document the model API doesn't list", () => {
    const [decision] = planPrefixRenames(input([save], { listed: new Map() }));
    expect(decision).toMatchObject({ kind: "skip", newName: "SUB_Order_Save", reason: "not listed by the model API, so it can't be loaded" });
  });

  it("skips a new name that is not valid", () => {
    const document = appDocument("x", MF, "ACT_1Order_Save");
    const [decision] = planPrefixRenames({ ...input([document]), change: { ...change, newPrefix: null } });
    expect(decision).toMatchObject({ kind: "skip", newName: "1Order_Save" });
    expect(decision.kind === "skip" && decision.reason).toContain("must start with a letter");
  });

  it("skips a document named like an entity, association or role, or whose new name is one", () => {
    const reservedNames = new Map([
      ["M.ACT_Order_Save", "entity M.ACT_Order_Save"],
      ["M.SUB_Order_Show", "module role M.SUB_Order_Show"],
    ]);
    const decisions = planPrefixRenames(input([save, show], { reservedNames }));
    expect(decisions.map((d) => d.kind === "skip" && d.reason)).toEqual([
      "shares its name with entity M.ACT_Order_Save, so references to it can't be told apart",
      "the new name is used by module role M.SUB_Order_Show",
    ]);
  });

  it("skips a document a Marketplace module uses", () => {
    const marketplaceReferences = new Map([["M.ACT_Order_Save", "Atlas_Core.Page_Layout"]]);
    const [decision] = planPrefixRenames(input([save], { marketplaceReferences }));
    expect(decision).toMatchObject({ kind: "skip", reason: "used by Atlas_Core.Page_Layout in a Marketplace module, which is never changed" });
  });

  it("skips a new name that exists, in any case and of any document type", () => {
    const decisions = planPrefixRenames(input([save, show], {}, ["sub_order_save", "SUB_Order_Show"]));
    expect(decisions.map((d) => d.kind === "skip" && d.reason)).toEqual(["M.SUB_Order_Save already exists", "M.SUB_Order_Show already exists"]);
  });

  it("never chains renames: a name that existed at the start stays taken", () => {
    // ACT_ACT_Order_Save would get the name ACT_Order_Save, which is itself renamed to Order_Save.
    const outer = appDocument("x", MF, "ACT_ACT_Order_Save");
    const decisions = planPrefixRenames({ ...input([save, outer]), change: { ...change, newPrefix: null } });
    expect(decisions.map((d) => d.kind)).toEqual(["rename", "skip"]);
    expect(decisions[1]).toMatchObject({ newName: "ACT_Order_Save", reason: "M.ACT_Order_Save already exists" });
  });

  it("skips the second of two renames onto names that differ only in case", () => {
    const upper = appDocument("a", MF, "ACT_Order_Save");
    const lower = appDocument("b", MF, "ACT_order_save");
    const decisions = planPrefixRenames({ ...input([upper, lower]), change: { ...change, newPrefix: null } });
    expect(decisions.map((d) => d.kind)).toEqual(["rename", "skip"]);
  });

  it("checks names only within the document's own module", () => {
    const other = appDocument("o", MF, "ACT_Order_Save", "N");
    const planInput = input([other], {}, ["SUB_Order_Save"]);
    planInput.names.add("N", "ACT_Order_Save");
    expect(planPrefixRenames(planInput)).toEqual([{ kind: "rename", document: other, newName: "SUB_Order_Save" }]);
  });
});
