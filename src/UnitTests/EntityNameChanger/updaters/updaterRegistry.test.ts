import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { AssociationRenamePlan } from "../../../EntityNameChanger/framework/AssociationRenamePlan";
import { DocumentNameRegistry } from "../../../EntityNameChanger/framework/DocumentNameRegistry";
import { QualifiedNameRenames } from "../../../EntityNameChanger/framework/QualifiedNameRenames";
import { fakeContext, fakeUnitInfo } from "../helpers/fakes";
import { AssociationUpdater } from "../../../EntityNameChanger/updaters/domainModels/AssociationUpdater";
import { DocumentUpdater } from "../../../EntityNameChanger/updaters/documents/DocumentUpdater";
import { FlowUpdater } from "../../../EntityNameChanger/updaters/microflows/FlowUpdater";
import { PageUpdater } from "../../../EntityNameChanger/updaters/pages/PageUpdater";
import { ReferenceUpdater } from "../../../EntityNameChanger/updaters/references/ReferenceUpdater";
import { RefreshUpdater } from "../../../EntityNameChanger/updaters/refresh/RefreshUpdater";
import {
  type AppModel,
  createUpdaters,
  EXCLUDED_DOCUMENT_TYPES,
  REFERENCE_DOCUMENT_TYPES,
} from "../../../EntityNameChanger/updaters/updaterRegistry";

// Every model API the registry passes on; each is a distinct marker object.
const API_NAMES = [
  "microflows",
  "nanoflows",
  "rules",
  "pages",
  "snippets",
  "layouts",
  "menuDocuments",
  "workflows",
  "importMappings",
  "exportMappings",
  "jsonStructures",
  "messageDefinitions",
  "javaActions",
  "javaScriptActions",
  "documentTemplates",
  "dataSets",
  "domainModels",
  "scheduledEvents",
  "publishedRestServices",
  "publishedODataServices2",
  "publishedWebServices",
  "consumedRestServices",
  "mlMappingDocuments",
];
const model = Object.fromEntries(API_NAMES.map((name) => [name, { api: name }])) as unknown as AppModel;

const PLAN_LABELS = [
  "Microflows (plan)",
  "Nanoflows (plan)",
  "Rules (plan)",
  "Pages (plan)",
  "Snippets (plan)",
  "Workflows (plan)",
  "Import mappings (plan)",
  "Export mappings (plan)",
  "JSON structures (plan)",
  "Message definitions",
  "Java actions",
  "JavaScript actions",
  "Document templates",
  "Datasets",
  "Associations (plan)",
];

const RENAME_LABELS = [
  "Associations",
  "Microflows",
  "Nanoflows",
  "Rules",
  "Pages",
  "Snippets",
  "Workflows",
  "Import mappings",
  "Export mappings",
  "JSON structures",
];

const REFERENCE_LABELS = [
  "References in domain models",
  "References in microflows",
  "References in nanoflows",
  "References in rules",
  "References in pages",
  "References in snippets",
  "References in layouts",
  "References in menus",
  "References in workflows",
  "References in import mappings",
  "References in export mappings",
  "References in message definitions",
  "References in datasets",
  "References in document templates",
  "References in scheduled events",
  "References in published REST services",
  "References in published OData services",
  "References in published web services",
];

const REFRESH_LABELS = ["Refresh pages", "Refresh snippets"];

const context = fakeContext();

function create(renames = QualifiedNameRenames.forEntity(context), associationPlan = new AssociationRenamePlan()) {
  return createUpdaters(model, {
    context,
    documentNames: new DocumentNameRegistry(),
    renames,
    associationPlan,
  });
}

const all = (groups = create()) => [...groups.planners, ...groups.renamers, ...groups.referenceUpdaters, ...groups.refreshers];
const byLabel = (label: string, groups = create()) => all(groups).find((u) => u.label === label)!;

function flowWithOrderParameter(name: string): Primitives.UnitBase {
  return {
    $Type: "Microflows$Microflow",
    name,
    objectCollection: {
      objects: [
        {
          $Type: "Microflows$MicroflowParameterObject",
          $ID: "p1",
          name: "Order",
          defaultValue: null,
          variableType: { $Type: "DataTypes$ObjectType", entity: "MyModule.Order" },
        },
      ],
    },
    flows: [],
    parameters: [{ name: "Order" }],
    microflowReturnType: { $Type: "DataTypes$VoidType" },
    returnVariableName: "",
  } as unknown as Primitives.UnitBase;
}

describe("createUpdaters", () => {
  it("returns planners, renamers, reference updaters and refreshers", () => {
    const groups = create();
    expect(groups.planners.map((u) => u.label)).toEqual(PLAN_LABELS);
    expect(groups.renamers.map((u) => u.label)).toEqual(RENAME_LABELS);
    expect(groups.referenceUpdaters.map((u) => u.label)).toEqual(REFERENCE_LABELS);
    expect(groups.refreshers.map((u) => u.label)).toEqual(REFRESH_LABELS);
  });

  it("titles the plan steps", () => {
    const titles = all().map((u) => u.title).filter((t) => t !== undefined);
    expect(titles).toEqual(["Planning microflows", "Planning nanoflows", "Planning rules", "Planning pages", "Planning snippets", "Planning workflows", "Planning import mappings", "Planning export mappings", "Planning JSON structures", "Planning associations", "Refreshing pages", "Refreshing snippets"]);
  });

  it("implements the flow and page planners, every renamer and every reference updater", () => {
    expect(all().filter((u) => u.implemented).map((u) => u.label)).toEqual([
      "Microflows (plan)",
      "Nanoflows (plan)",
      "Rules (plan)",
      "Pages (plan)",
      "Snippets (plan)",
      "Workflows (plan)",
      "Import mappings (plan)",
      "Export mappings (plan)",
      "JSON structures (plan)",
      "Associations (plan)",
      ...RENAME_LABELS,
      ...REFERENCE_LABELS,
      ...REFRESH_LABELS,
    ]);
  });

  it("passes the matching model api and unit type to the flow and page updaters", () => {
    const groups = create();
    for (const [label, type, api] of [
      ["Microflows", "Microflows$Microflow", "microflows"],
      ["Nanoflows", "Microflows$Nanoflow", "nanoflows"],
      ["Rules", "Microflows$Rule", "rules"],
    ] as const) {
      for (const suffix of ["", " (plan)"]) {
        expect(byLabel(label + suffix, groups)).toBeInstanceOf(FlowUpdater);
        expect(byLabel(label + suffix, groups).access).toBe(model[api]);
        expect(byLabel(label + suffix, groups).unitType).toBe(type);
      }
    }
    for (const [label, type, api] of [
      ["Pages", "Pages$Page", "pages"],
      ["Snippets", "Pages$Snippet", "snippets"],
    ] as const) {
      for (const suffix of ["", " (plan)"]) {
        expect(byLabel(label + suffix, groups)).toBeInstanceOf(PageUpdater);
        expect(byLabel(label + suffix, groups).access).toBe(model[api]);
        expect(byLabel(label + suffix, groups).unitType).toBe(type);
      }
    }
    for (const [label, type, api] of [
      ["Workflows", "Workflows$Workflow", "workflows"],
      ["Import mappings", "ImportMappings$ImportMapping", "importMappings"],
      ["Export mappings", "ExportMappings$ExportMapping", "exportMappings"],
      ["JSON structures", "JsonStructures$JsonStructure", "jsonStructures"],
    ] as const) {
      for (const suffix of ["", " (plan)"]) {
        expect(byLabel(label + suffix, groups)).toBeInstanceOf(DocumentUpdater);
        expect(byLabel(label + suffix, groups).access).toBe(model[api]);
        expect(byLabel(label + suffix, groups).unitType).toBe(type);
      }
    }
    expect(byLabel("Associations", groups).access).toBe(model.domainModels);
    expect(byLabel("Datasets", groups).unitType).toBe("DataSets$DataSet");
  });

  it("updates references in domain models before flows and pages", () => {
    const labels = create().referenceUpdaters.map((u) => u.label);
    expect(labels[0]).toBe("References in domain models");
    expect(labels.indexOf("References in domain models")).toBeLessThan(labels.indexOf("References in pages"));
  });

  it("passes the matching model api and unit type to each reference updater", () => {
    const groups = create();
    for (const type of REFERENCE_DOCUMENT_TYPES) {
      const updater = byLabel(`References in ${type.documents}`, groups);
      expect(updater).toBeInstanceOf(ReferenceUpdater);
      expect(updater.access).toBe(model[type.api]);
      expect(updater.unitType).toBe(type.unitType);
    }
    expect(byLabel("References in message definitions", groups).access).toBe(model.messageDefinitions);
  });

  it("refreshes pages and snippets with their model api", () => {
    const groups = create();
    expect(groups.refreshers.every((u) => u instanceof RefreshUpdater)).toBe(true);
    expect(byLabel("Refresh pages", groups)).toMatchObject({ access: model.pages, unitType: "Pages$Page" });
    expect(byLabel("Refresh snippets", groups)).toMatchObject({ access: model.snippets, unitType: "Pages$Snippet" });
  });

  it("shares the rename map and plan between the phases", async () => {
    const groups = create();
    const flow = flowWithOrderParameter("ACT_Order");
    const flowInfo = fakeUnitInfo("mf", "Microflows$Microflow", "MyModule", "ACT_Order");
    await byLabel("Microflows (plan)", groups).update(flow, flowInfo);
    expect((flow as unknown as { name: string }).name).toBe("ACT_Order");

    expect(await byLabel("Microflows", groups).update(flow, flowInfo)).toMatchObject({ changed: true, renamedTo: "ACT_Purchase", renamedVariables: 1 });

    const entityRef = { $Type: "DomainModels$DirectEntityRef", entity: "MyModule.Order" };
    const call = { $Type: "Pages$MicroflowSettings", microflow: "MyModule.ACT_Order" };
    const page = { $Type: "Pages$Page", name: "Customer_Edit", parameters: [], variables: [], widgets: [entityRef, call] } as unknown as Primitives.UnitBase;
    expect(await byLabel("References in pages", groups).update(page, fakeUnitInfo("p", "Pages$Page", "MyModule", "Customer_Edit"))).toMatchObject({ changed: true, updatedReferences: 2 });
    expect(entityRef.entity).toBe("MyModule.Purchase");
    expect(call.microflow).toBe("MyModule.ACT_Purchase");
  });

  it("updates references in every domain model, the entity's own included", async () => {
    const references = byLabel("References in domain models");
    const own = { $Type: "DomainModels$DomainModel", handler: { $Type: "DomainModels$EventHandler", microflow: "MyModule.Order_Handler" }, generalization: "MyModule.Order" };
    expect((await references.update(own as unknown as Primitives.UnitBase, fakeUnitInfo(context.domainModelId, "DomainModels$DomainModel", "MyModule"))).changed).toBe(true);
    expect(own.generalization).toBe("MyModule.Purchase");
    const other = { $Type: "DomainModels$DomainModel", child: "MyModule.Order" };
    expect((await references.update(other as unknown as Primitives.UnitBase, fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Invoicing"))).changed).toBe(true);
    expect(other.child).toBe("MyModule.Purchase");
  });

  it("uses the rename map it is given", async () => {
    const renames = QualifiedNameRenames.forEntity(context);
    const groups = create(renames);
    renames.addDocument("MyModule", "ACT_Order", "ACT_Purchase");
    const event = { $Type: "ScheduledEvents$ScheduledEvent", microflow: "MyModule.ACT_Order" };
    await byLabel("References in scheduled events", groups).update(event as unknown as Primitives.UnitBase, fakeUnitInfo("se", "ScheduledEvents$ScheduledEvent", "MyModule"));
    expect(event.microflow).toBe("MyModule.ACT_Purchase");
  });

  it("plans associations last and renames them first, with the shared plans", async () => {
    const associationPlan = new AssociationRenamePlan();
    const renames = QualifiedNameRenames.forEntity(context);
    const groups = create(renames, associationPlan);
    expect(groups.planners.at(-1)).toBeInstanceOf(AssociationUpdater);
    expect(groups.renamers[0]).toBeInstanceOf(AssociationUpdater);
    expect(byLabel("Associations (plan)", groups).access).toBe(model.domainModels);
    const association = { $Type: "DomainModels$CrossAssociation", $ID: "a1", name: "Invoice_Order", parent: "Other.Invoice", child: "MyModule.Order" };
    const other = { $Type: "DomainModels$DomainModel", $ID: "dm-2", entities: [], associations: [], crossAssociations: [association] } as unknown as Primitives.UnitBase;
    const info = fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Other");
    await byLabel("Associations (plan)", groups).update(other, info);
    expect(association.name).toBe("Invoice_Order");
    expect(associationPlan.get("dm-2")).toEqual(new Map([["a1", "Invoice_Purchase"]]));
    expect(renames.map.get("Other.Invoice_Order")).toBe("Other.Invoice_Purchase");
    expect(await byLabel("Associations", groups).update(other, info)).toMatchObject({ changed: true, renamedAssociations: 1 });
    expect(association.name).toBe("Invoice_Purchase");
  });

  it("documents the excluded types with a reason", () => {
    expect(EXCLUDED_DOCUMENT_TYPES.every((e) => e.label.length > 0 && e.reason.length > 0)).toBe(true);
  });

  it("renames a JSON structure only after an entity mapping using it was planned", async () => {
    const groups = create();
    const json = { $Type: "JsonStructures$JsonStructure", name: "JSON_Order", elements: [] } as unknown as Primitives.UnitBase;
    const jsonInfo = fakeUnitInfo("js", "JsonStructures$JsonStructure", "MyModule", "JSON_Order");
    const mapping = {
      $Type: "ImportMappings$ImportMapping",
      name: "IMM_Order",
      jsonStructure: "MyModule.JSON_Order",
      parameterType: { $Type: "DataTypes$UnknownType" },
      rootMappingElements: [{ $Type: "ImportMappings$ImportObjectMappingElement", entity: "MyModule.Order", children: [] }],
    } as unknown as Primitives.UnitBase;
    await byLabel("Import mappings (plan)", groups).update(mapping, fakeUnitInfo("imm", "ImportMappings$ImportMapping", "MyModule", "IMM_Order"));
    await byLabel("JSON structures (plan)", groups).update(json, jsonInfo);
    expect(await byLabel("JSON structures", groups).update(json, jsonInfo)).toMatchObject({ changed: true, renamedTo: "JSON_Purchase" });
  });
});
