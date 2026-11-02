import { describe, expect, it } from "vitest";
import { RenameReport } from "../../../NameChanger/framework/RenameReport";
import { JobReport } from "../../../shared/rename/JobReport";
import { UNCHANGED } from "../../../shared/rename/types";
import { changed, fakeUnitInfo } from "../../shared/helpers/fakes";

// The generic counting is tested in UnitTests/shared/rename/JobReport.test.ts.
describe("RenameReport", () => {
  const info = fakeUnitInfo("u1", "Microflows$Microflow", "MyModule", "ACT_Order");
  const other = fakeUnitInfo("u2", "Microflows$Microflow", "MyModule", "ACT_Customer");
  const third = fakeUnitInfo("u3", "Pages$Page", "MyModule", "Order_Edit");

  it("starts empty and is a job report", () => {
    const report = new RenameReport();
    expect(report).toBeInstanceOf(JobReport);
    expect(report.entityRenamed).toBe(false);
    expect(report.entitySkipReason).toBeNull();
    expect(report.summary()).toEqual(["Checked 0 documents, updated 0."]);
  });

  it("reports an incomplete rename", () => {
    const report = new RenameReport();
    report.entityRenamed = true;
    report.markIncomplete("cancelled by user");
    expect(report.incompleteReason).toBe("cancelled by user");
    expect(report.summary()).toEqual(["Checked 0 documents, updated 0.", "Not finished: cancelled by user"]);
  });

  it("summarizes every outcome", () => {
    const report = new RenameReport();
    report.addResult("Microflows", info, changed({ renamedTo: "ACT_Purchase" }));
    report.addResult("Microflows", other, changed());
    report.addResult("Pages", third, { ...UNCHANGED, skippedRenames: 1 });
    report.addResult("References in microflows", info, changed({ updatedReferences: 4 }));
    report.addError("Microflows", fakeUnitInfo("u4", "Microflows$Microflow", "MyModule", "ACT_Broken"), new Error("boom"));
    report.skipEntity("reason");
    expect(report.entitySkipReason).toBe("reason");
    expect(report.summary()).toEqual([
      "Checked 4 documents, updated 2.",
      "Renamed 1 documents.",
      "Updated 4 references to the renamed entity, documents, parameters and associations.",
      "Skipped 1 renames because the new name is already in use (see the log).",
      "Failed: Microflows MyModule.ACT_Broken: boom",
      "Entity not renamed: reason",
    ]);
  });

  it("sums renamed associations and reports them", () => {
    const report = new RenameReport();
    report.addResult("Associations", fakeUnitInfo("dm-2", "DomainModels$DomainModel", "Other"), changed({ renamedVariables: 0, renamedAssociations: 2 }));
    report.renamedAssociations += 1;
    expect(report.renamedAssociations).toBe(3);
    expect(report.summary()).toContain("Renamed 3 associations.");
    expect(report.navigationWarnings()).toEqual([]);
  });
});

describe("RenameReport.changedMappedMessageDefinitions", () => {
  it("lists each changed message definition with the mappings of its definitions that use the entity", () => {
    const report = new RenameReport();
    report.messageDefinitionUsage.add("MyModule.MD_Messages.Order", "MyModule.IMM_Order");
    report.messageDefinitionUsage.add("MyModule.MD_Messages.Customer", "MyModule.IMM_Customer");
    report.messageDefinitionUsage.add("MyModule.MD_Order", "MyModule.EMM_Order");
    report.messageDefinitionUsage.addEntityDefinition("MyModule.MD_Messages.Order");
    report.messageDefinitionUsage.addEntityDefinition("MyModule.MD_Order");
    const collection = fakeUnitInfo("m1", "MessageDefinitions$MessageDefinitionCollection", "MyModule", "MD_Messages");
    report.addResult("Message definitions", collection, changed());
    report.addResult("References in message definitions", collection, changed({ renamedVariables: 0, updatedReferences: 1 }));
    report.addResult("References in message definition documents", fakeUnitInfo("m2", "MessageDefinitions$MessageDefinition2", "MyModule", "MD_Order"), changed({ updatedReferences: 1 }));
    report.addResult("Message definitions", fakeUnitInfo("m3", "MessageDefinitions$MessageDefinitionCollection", "MyModule", "MD_Unused"), changed());
    report.addResult("Import mappings", fakeUnitInfo("i1", "ImportMappings$ImportMapping", "MyModule", "MD_Order"), changed());
    expect(report.changedMappedMessageDefinitions()).toEqual([
      { unitId: "m1", qualifiedName: "MyModule.MD_Messages", mappings: ["MyModule.IMM_Order"] },
      { unitId: "m2", qualifiedName: "MyModule.MD_Order", mappings: ["MyModule.EMM_Order"] },
    ]);
  });
});
