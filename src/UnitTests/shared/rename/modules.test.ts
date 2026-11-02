import { describe, expect, it } from "vitest";
import { getAppstoreModuleNames } from "../../../shared/rename/modules";

const module = (name: string, fromAppStore = false) => ({ name, fromAppStore });

describe("getAppstoreModuleNames", () => {
  it("always includes System and adds marketplace modules", () => {
    expect([...getAppstoreModuleNames([module("MyModule"), module("Atlas_Core", true)])]).toEqual(["System", "Atlas_Core"]);
  });

  it("returns only System without marketplace modules", () => {
    expect([...getAppstoreModuleNames([])]).toEqual(["System"]);
  });

  it("takes module tree nodes, which carry more than the name and origin", () => {
    const tree = [{ ...module("Atlas_Core", true), $ID: "m1", folders: [], documents: [] }];
    expect([...getAppstoreModuleNames(tree)]).toEqual(["System", "Atlas_Core"]);
  });
});
