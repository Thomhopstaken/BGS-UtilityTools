import { describe, expect, it } from "vitest";
import { collectPrefixes, listDocuments, loadPreFixerData, prefixKey } from "../../PreFixer/prefixModel";
import { RenamedDocumentNames } from "../../shared/rename/RenamedDocumentNames";
import { appDocument, CONSTANT, MF, NF, PAGE, treeDocument, treeModule } from "./helpers/fakeModel";

describe("listDocuments", () => {
  it("flattens nested folders and gives every document its module", () => {
    const tree = [
      treeModule("M", [treeDocument("a", MF, "ACT_A_B")], [{ documents: [treeDocument("b", PAGE, "POP_A_B")], folders: [{ documents: [treeDocument("c", MF, "SUB_A_B")] }] }]),
      treeModule("N", [treeDocument("d", CONSTANT, "CON_A_B")]),
    ];
    expect(listDocuments(tree)).toEqual([
      appDocument("a", MF, "ACT_A_B", "M"),
      appDocument("b", PAGE, "POP_A_B", "M"),
      appDocument("c", MF, "SUB_A_B", "M"),
      appDocument("d", CONSTANT, "CON_A_B", "N"),
    ]);
  });

  it("skips unnamed documents and empty modules", () => {
    expect(listDocuments([treeModule("M", [{ $ID: "x", $Type: MF }]), { name: "E", fromAppStore: false }])).toEqual([]);
  });
});

describe("collectPrefixes", () => {
  it("counts prefixes per type group; microflows and nanoflows share one", () => {
    const options = collectPrefixes([
      appDocument("1", MF, "ACT_Order_Save"),
      appDocument("2", NF, "ACT_Order_Show"),
      appDocument("3", PAGE, "ACT_Order_Edit"),
      appDocument("4", MF, "ACT_Customer_Get", "N"),
    ]);
    expect(options).toEqual([
      { key: "flows:ACT", group: "flows", groupLabel: "Microflows & nanoflows", prefix: "ACT", count: 3, example: "ACT_Customer_Get" },
      { key: "pages:ACT", group: "pages", groupLabel: "Pages", prefix: "ACT", count: 1, example: "ACT_Order_Edit" },
    ]);
  });

  it("keeps prefixes apart by case and leaves out names without a prefix", () => {
    const options = collectPrefixes([
      appDocument("1", MF, "ACT_Order_Save"),
      appDocument("2", MF, "Act_Order_Save"),
      appDocument("3", MF, "ACT_Save"),
      appDocument("4", MF, "ABCDE_Order_Save"),
      appDocument("5", MF, "SUB_Order_Save"),
      appDocument("6", MF, "ACT_"),
    ]);
    expect(options.map((o) => [o.key, o.count])).toEqual([
      ["flows:ACT", 2],
      ["flows:SUB", 1],
    ]);
  });

  it("leaves out types that are never renamed", () => {
    expect(
      collectPrefixes([
        appDocument("1", "DomainModels$ViewEntitySourceDocument", "VE_Order_Source"),
        appDocument("2", "DocumentTemplates$DocumentTemplate", "DT_Order_Print"),
        appDocument("3", "Some$FutureType", "FT_Order_X"),
      ]),
    ).toEqual([]);
  });

  it("sorts by group label, then prefix", () => {
    const options = collectPrefixes([
      appDocument("1", PAGE, "POP_A_B"),
      appDocument("2", MF, "SUB_A_B"),
      appDocument("3", CONSTANT, "CON_A_B"),
      appDocument("4", MF, "ACT_A_B"),
    ]);
    expect(options.map((o) => o.key)).toEqual(["constants:CON", "flows:ACT", "flows:SUB", "pages:POP"]);
  });
});

describe("prefixKey", () => {
  it("joins group and prefix", () => {
    expect(prefixKey("flows", "ACT")).toBe("flows:ACT");
  });
});

describe("loadPreFixerData", () => {
  it("puts this session's renames over the tree", async () => {
    const renamedNames = new RenamedDocumentNames();
    renamedNames.record([{ unitId: "1", unitType: MF, oldQualifiedName: "M.ACT_Order_Save", newQualifiedName: "M.SUB_Order_Save" }]);
    const tree = [treeModule("M", [treeDocument("1", MF, "ACT_Order_Save")])];
    const data = await loadPreFixerData({ getModulesTree: async () => tree }, renamedNames);
    expect(data.prefixes.map((o) => [o.key, o.count, o.example])).toEqual([[prefixKey("flows", "SUB"), 1, "SUB_Order_Save"]]);
  });

  it("makes one tree call and counts only the own modules", async () => {
    let calls = 0;
    const tree = [
      treeModule("M", [treeDocument("1", MF, "ACT_Order_Save")]),
      treeModule("Atlas_Core", [treeDocument("2", MF, "ACT_Atlas_Do")], [], true),
      treeModule("System", [treeDocument("3", MF, "ACT_System_Do")]),
    ];
    const data = await loadPreFixerData(
      {
        getModulesTree: async () => {
          calls++;
          return tree;
        },
      },
      new RenamedDocumentNames(),
    );
    expect(calls).toBe(1);
    expect([...data.excludedModules]).toEqual(["System", "Atlas_Core"]);
    expect(data.prefixes.map((o) => [o.key, o.count])).toEqual([[prefixKey("flows", "ACT"), 1]]);
  });
});
