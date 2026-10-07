import type { Primitives } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { QualifiedNameRenames } from "../../../../EntityNameChanger/framework/QualifiedNameRenames";
import { UNCHANGED } from "../../../../EntityNameChanger/framework/types";
import { ReferenceUpdater } from "../../../../EntityNameChanger/updaters/references/ReferenceUpdater";
import { fakeUnitAccess, fakeUnitInfo } from "../../helpers/fakes";

function setup() {
  const renames = new QualifiedNameRenames();
  renames.add("MyModule.Order", "MyModule.Purchase");
  const access = fakeUnitAccess<Primitives.UnitBase>([]);
  const updater = new ReferenceUpdater({ documents: "pages", unitType: "Pages$Page" }, access, renames);
  return { updater, access, renames };
}

const info = fakeUnitInfo("p1", "Pages$Page", "MyModule", "Customer_Edit");

describe("ReferenceUpdater", () => {
  it("has the reference metadata", () => {
    const { updater, access } = setup();
    expect(updater).toMatchObject({ label: "References in pages", unitType: "Pages$Page", implemented: true });
    expect(updater.access).toBe(access);
  });

  it("rewrites references and reports the count", async () => {
    const { updater } = setup();
    const entityRef = { $Type: "DomainModels$DirectEntityRef", entity: "MyModule.Order" };
    const attribute = { $Type: "DomainModels$AttributeRef", attribute: "MyModule.Order.Name" };
    const unit = { $Type: "Pages$Page", $ID: "p1", name: "Customer_Edit", widgets: [entityRef, attribute] } as unknown as Primitives.UnitBase;
    expect(await updater.update(unit, info)).toEqual({ ...UNCHANGED, changed: true, updatedReferences: 2 });
    expect(entityRef.entity).toBe("MyModule.Purchase");
    expect(attribute.attribute).toBe("MyModule.Purchase.Name");
  });

  it("reports a unit without references as unchanged", async () => {
    const { updater } = setup();
    const unit = { $Type: "Pages$Page", $ID: "p1", name: "Order_Help", entity: "MyModule.OrderLine" } as unknown as Primitives.UnitBase;
    expect(await updater.update(unit, info)).toEqual(UNCHANGED);
  });

  it("uses renames recorded after it was created", async () => {
    const { updater, renames } = setup();
    renames.addDocument("MyModule", "ACT_Order", "ACT_Purchase");
    const settings = { $Type: "Pages$MicroflowSettings", microflow: "MyModule.ACT_Order" };
    const unit = { $Type: "Pages$Page", $ID: "p1", name: "Customer_Edit", widgets: [settings] } as unknown as Primitives.UnitBase;
    expect((await updater.update(unit, info)).updatedReferences).toBe(1);
    expect(settings.microflow).toBe("MyModule.ACT_Purchase");
  });
});
