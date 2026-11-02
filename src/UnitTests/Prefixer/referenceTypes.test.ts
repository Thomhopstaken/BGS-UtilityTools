import { describe, expect, it } from "vitest";
import { RENAMABLE_DOCUMENT_TYPES } from "../../Prefixer/documentTypes";
import { PREFIX_REFERENCE_DOCUMENT_TYPES } from "../../Prefixer/referenceTypes";
import { REFERENCE_DOCUMENT_TYPES } from "../../NameChanger/updaters/updaterRegistry";

const order = (unitType: string) => PREFIX_REFERENCE_DOCUMENT_TYPES.findIndex((type) => type.unitType === unitType);
const spec = (unitType: string) => PREFIX_REFERENCE_DOCUMENT_TYPES.find((type) => type.unitType === unitType);

describe("PREFIX_REFERENCE_DOCUMENT_TYPES", () => {
  it("lists every type once, each on the API of its renamable type", () => {
    const types = PREFIX_REFERENCE_DOCUMENT_TYPES.map((type) => type.unitType);
    expect(new Set(types).size).toBe(types.length);
    const apis = new Map(RENAMABLE_DOCUMENT_TYPES.map((type) => [type.unitType, type.api]));
    for (const type of PREFIX_REFERENCE_DOCUMENT_TYPES) {
      if (apis.has(type.unitType)) {
        expect(type.api).toBe(apis.get(type.unitType));
      }
    }
  });

  it("orders definitions before the flows and pages, published services last", () => {
    expect(order("Enumerations$Enumeration")).toBe(0);
    expect(order("DomainModels$DomainModel")).toBeLessThan(order("Microflows$Microflow"));
    expect(order("JavaActions$JavaAction")).toBeLessThan(order("Microflows$Microflow"));
    expect(order("Microflows$Microflow")).toBeLessThan(order("Pages$Page"));
    expect(order("Rest$PublishedRestService")).toBeGreaterThan(order("Workflows$Workflow"));
    expect(PREFIX_REFERENCE_DOCUMENT_TYPES.at(-1)?.unitType).toBe("BusinessEvents$BusinessEventService");
  });

  it("covers every document type the entity rename updates, except the ones that reference no documents", () => {
    const own = new Set(PREFIX_REFERENCE_DOCUMENT_TYPES.map((type) => type.unitType));
    const missing = REFERENCE_DOCUMENT_TYPES.map((type) => type.unitType).filter((unitType) => !own.has(unitType));
    expect(missing.sort()).toEqual([
      "ChangeDataCapture$EntityChangeDataCaptureService",
      "DomainModels$ViewEntitySourceDocument",
      "ExcelDataImporter$Template",
      "MLMappings$MLMappingDocument",
    ]);
  });

  it("adds the types that can hold constants or document references", () => {
    expect(spec("Enumerations$Enumeration")?.onlyProperties).toEqual(new Set(["image", "consumedODataService"]));
    expect(spec("WebServices$ImportedWebService")?.onlyProperties).toEqual(new Set(["locationConstant"]));
    expect(spec("Queues$Queue")?.onlyProperties).toEqual(new Set(["parallelismExpression"]));
    expect(spec("Authentication$Authentication")?.onlyProperties?.has("password")).toBe(true);
    expect(spec("ConnectorKit$Connector")?.onlyProperties?.has("propertyValueExpression")).toBe(true);
    expect(spec("Pages$PageTemplate")?.onlyProperties).toBeUndefined();
    expect(spec("Pages$BuildingBlock")?.onlyProperties).toBeUndefined();
  });

  it("allows constants in connection settings without touching SQL or names", () => {
    const database = spec("DatabaseConnector$DatabaseConnection")?.onlyProperties;
    expect(database?.has("connectionString")).toBe(true);
    expect(database?.has("DatabaseConnector$ValueAsConstant.value")).toBe(true);
    expect(database?.has("query")).toBe(false);
    expect(database?.has("name")).toBe(false);
    const odata = spec("Rest$ConsumedODataService")?.onlyProperties;
    expect(odata?.has("proxyHost")).toBe(true);
    expect(odata?.has("Microflows$HttpHeaderEntry.value")).toBe(true);
    expect(spec("Rest$ConsumedRestService")?.onlyProperties?.has("Rest$ConstantValue.value")).toBe(true);
    expect(spec("Rest$ConsumedRestService")?.onlyProperties?.has("value")).toBe(false);
  });
});
