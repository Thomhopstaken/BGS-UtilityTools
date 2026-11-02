import { describe, expect, it } from "vitest";
import { NO_LOCAL_RENAMES } from "../../../../NameChanger/updaters/documents/DocumentUpdater";
import { JsonStructureInspector } from "../../../../NameChanger/updaters/documents/JsonStructureInspector";
import { jsonStructure } from "../../helpers/documentBuilders";
import { fakeUnitInfo } from "../../../shared/helpers/fakes";

const info = (name: string, moduleName: string | undefined = "MyModule") =>
  fakeUnitInfo("json-1", "JsonStructures$JsonStructure", moduleName, name);

describe("JsonStructureInspector", () => {
  const used = new Set(["MyModule.JSON_Order"]);
  const inspector = new JsonStructureInspector(used);

  it("uses the entity only when an entity mapping uses the structure", () => {
    expect(inspector.usesEntity(jsonStructure("JSON_Order"), info("JSON_Order"))).toBe(true);
    expect(inspector.usesEntity(jsonStructure("JSON_Order_Unused"), info("JSON_Order_Unused"))).toBe(false);
    expect(inspector.usesEntity(jsonStructure("JSON_Order"), info("JSON_Order", "Other"))).toBe(false);
    expect(inspector.usesEntity(jsonStructure("JSON_Order"), { $ID: "json-1", $Type: "JsonStructures$JsonStructure", name: "JSON_Order" } as never)).toBe(false);
  });

  it("sees structures added after it was created", () => {
    used.add("MyModule.JSON_Late");
    expect(inspector.usesEntity(jsonStructure("JSON_Late"), info("JSON_Late"))).toBe(true);
  });

  it("has no local renames and changes nothing", () => {
    expect(inspector.planLocalRenames()).toBe(NO_LOCAL_RENAMES);
    expect(inspector.apply()).toBe(0);
  });
});
