import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { rewriteExistingReferences } from "../../../shared/rename/existingReferences";
import { QualifiedNameRenames } from "../../../shared/rename/QualifiedNameRenames";
import { ReferenceIndex } from "../../../shared/rename/ReferenceIndex";
import { fakeUnitInfo } from "../helpers/fakes";

const info = fakeUnitInfo("page-1", "Pages$Page", "M", "POP_Order");

function renames(): QualifiedNameRenames {
  const result = new QualifiedNameRenames();
  result.addDocument("M", "ACT_Save", "SUB_Save", "mf-1");
  result.addDocument("M", "ACT_Load", "SUB_Load", "mf-2");
  return result;
}

const page = (...microflows: string[]) =>
  ({ $ID: "page-1", $Type: "Pages$Page", name: "POP_Order", widgets: microflows.map((microflow) => ({ $Type: "W", microflow })) }) as unknown as Primitives.UnitBase & {
    widgets: { microflow: string }[];
  };

describe("rewriteExistingReferences", () => {
  it("rewrites only names whose declaring unit was saved, and leaves the rest to the reference pass", () => {
    const unit = page("M.ACT_Save", "M.ACT_Load");
    const index = new ReferenceIndex();
    expect(rewriteExistingReferences(unit, info, renames(), { isSaved: (id) => id === "mf-1", index })).toBe(1);
    expect(unit.widgets.map((w) => w.microflow)).toEqual(["M.SUB_Save", "M.ACT_Load"]);
    expect(index.isUpToDate("page-1")).toBe(false);
  });

  it("marks the unit up to date when nothing renamed is left", () => {
    const unit = page("M.ACT_Save", "M.ACT_Load");
    const index = new ReferenceIndex();
    expect(rewriteExistingReferences(unit, info, renames(), { isSaved: () => true, index })).toBe(2);
    expect(index.isUpToDate("page-1")).toBe(true);
  });

  it("marks a unit without renamed references up to date without changes", () => {
    const index = new ReferenceIndex();
    expect(rewriteExistingReferences(page("M.Other"), info, renames(), { isSaved: () => false, index })).toBe(0);
    expect(index.isUpToDate("page-1")).toBe(true);
  });

  it("respects the allow-list for the rewrite and for what is left", () => {
    const unit = { $ID: "page-1", $Type: "Pages$Page", name: "P", documentation: "M.ACT_Load", widgets: [{ $Type: "W", microflow: "M.ACT_Save" }] } as unknown as Primitives.UnitBase & {
      documentation: string;
    };
    const index = new ReferenceIndex();
    expect(rewriteExistingReferences(unit, info, renames(), { isSaved: () => true, index }, new Set(["microflow"]))).toBe(1);
    expect(unit.documentation).toBe("M.ACT_Load");
    expect(index.isUpToDate("page-1")).toBe(true);
  });
});
