import { describe, expect, it } from "vitest";
import { isInScope } from "../../../shared/rename/JobScope";
import { fakeScope, fakeUnitInfo } from "../helpers/fakes";

describe("isInScope", () => {
  const scope = fakeScope(["System", "Marketplace"]);

  it("accepts units of own modules", () => {
    expect(isInScope(fakeUnitInfo("u", "T", "MyModule"), scope)).toBe(true);
  });

  it("rejects excluded modules", () => {
    expect(isInScope(fakeUnitInfo("u", "T", "Marketplace"), scope)).toBe(false);
    expect(isInScope(fakeUnitInfo("u", "T", "System"), scope)).toBe(false);
  });

  it("rejects units without a module", () => {
    expect(isInScope({ $ID: "u", $Type: "T" } as never, scope)).toBe(false);
  });
});
