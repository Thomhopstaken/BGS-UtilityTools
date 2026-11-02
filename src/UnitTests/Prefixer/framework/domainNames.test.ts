import type { DomainModels, Security } from "@mendix/extensions-api";
import { describe, expect, it } from "vitest";
import { collectReservedNames } from "../../../Prefixer/framework/domainNames";

const domainModel = (entities: string[], associations: string[] = [], cross: string[] = []) =>
  ({
    entities: entities.map((name) => ({ name })),
    associations: associations.map((name) => ({ name })),
    crossAssociations: cross.map((name) => ({ name })),
  }) as unknown as DomainModels.DomainModel;

const security = (roles: string[]) => ({ moduleRoles: roles.map((name) => ({ name })) }) as unknown as Security.ModuleSecurity;

describe("collectReservedNames", () => {
  it("qualifies entities, associations, cross-module associations and module roles with their module", () => {
    const names = collectReservedNames(
      [
        { moduleName: "M", unit: domainModel(["Order"], ["Order_Customer"], ["Order_Account"]) },
        { moduleName: "N", unit: domainModel(["Customer"]) },
      ],
      [{ moduleName: "M", unit: security(["User", "Admin"]) }],
    );
    expect([...names]).toEqual([
      ["M.Order", "entity M.Order"],
      ["M.Order_Customer", "association M.Order_Customer"],
      ["M.Order_Account", "association M.Order_Account"],
      ["N.Customer", "entity N.Customer"],
      ["M.User", "module role M.User"],
      ["M.Admin", "module role M.Admin"],
    ]);
  });

  it("skips missing lists and names", () => {
    const names = collectReservedNames(
      [{ moduleName: "M", unit: { entities: [{}] } as unknown as DomainModels.DomainModel }],
      [{ moduleName: "M", unit: {} as Security.ModuleSecurity }],
    );
    expect(names.size).toBe(0);
  });
});
