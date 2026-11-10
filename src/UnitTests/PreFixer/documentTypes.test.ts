import { describe, expect, it } from "vitest";
import { groupLabel, NOT_RENAMED_TYPES, RENAMABLE_DOCUMENT_TYPES, renamableType, typesOfGroup } from "../../PreFixer/documentTypes";

const order = (unitType: string) => RENAMABLE_DOCUMENT_TYPES.findIndex((type) => type.unitType === unitType);

describe("RENAMABLE_DOCUMENT_TYPES", () => {
  it("lists every unit type and API once", () => {
    const types = RENAMABLE_DOCUMENT_TYPES.map((type) => type.unitType);
    const apis = RENAMABLE_DOCUMENT_TYPES.map((type) => type.api);
    expect(new Set(types).size).toBe(types.length);
    expect(new Set(apis).size).toBe(apis.length);
  });

  it("never renames the types left out on purpose", () => {
    for (const unitType of NOT_RENAMED_TYPES.keys()) {
      expect(renamableType(unitType)).toBeUndefined();
    }
  });

  it("puts only microflows and nanoflows in one group", () => {
    expect(typesOfGroup("flows").map((type) => type.unitType)).toEqual(["Microflows$Nanoflow", "Microflows$Microflow"]);
    const groups = RENAMABLE_DOCUMENT_TYPES.filter((type) => type.group !== "flows").map((type) => type.group);
    expect(new Set(groups).size).toBe(groups.length);
    expect(renamableType("Microflows$Rule")?.group).toBe("rules");
  });

  it("renames callees before their callers", () => {
    expect(order("Constants$Constant")).toBeLessThan(order("Microflows$Microflow"));
    expect(order("JavaActions$JavaAction")).toBeLessThan(order("Microflows$Microflow"));
    expect(order("Microflows$Rule")).toBeLessThan(order("Microflows$Microflow"));
    expect(order("Pages$Snippet")).toBeLessThan(order("Pages$Page"));
    expect(order("Pages$Layout")).toBeLessThan(order("Pages$Page"));
    expect(order("Microflows$Microflow")).toBeLessThan(order("Rest$PublishedRestService"));
  });

  it("tags the risky types", () => {
    expect(renamableType("Constants$Constant")?.risks).toContain("constantValues");
    expect(renamableType("Microflows$Microflow")?.risks).toEqual(["navigation", "settings", "javaProxies"]);
    expect(renamableType("Microflows$Nanoflow")?.risks).toEqual(["navigation"]);
    expect(renamableType("Pages$Page")?.risks).toEqual(["navigation"]);
    expect(renamableType("JavaActions$JavaAction")?.risks).toEqual(["actionCode"]);
    expect(renamableType("DataSets$DataSet")?.risks).toEqual(["reportWidgets"]);
    expect(renamableType("Pages$Snippet")?.risks).toEqual([]);
  });
});

describe("groupLabel", () => {
  it("labels a group, or falls back to its key", () => {
    expect(groupLabel("flows")).toBe("Microflows & nanoflows");
    expect(groupLabel("constants")).toBe("Constants");
    expect(groupLabel("unknown")).toBe("unknown");
  });
});
