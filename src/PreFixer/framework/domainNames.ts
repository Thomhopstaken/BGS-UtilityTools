import type { DomainModels, Security } from "@mendix/extensions-api";

// A unit with the module it belongs to; the unit itself doesn't know its module.
export type InModule<TUnit> = {
  readonly moduleName: string;
  readonly unit: TUnit;
};

// Qualified names of entities, associations and module roles -> what they are. They share the Module.Name form with
// documents, so the rewrite of a document rename would also hit them; such renames are skipped.
export function collectReservedNames(
  domainModels: readonly InModule<DomainModels.DomainModel>[],
  securities: readonly InModule<Security.ModuleSecurity>[],
): Map<string, string> {
  const names = new Map<string, string>();
  const add = (moduleName: string, name: string | undefined, kind: string) => {
    if (name !== undefined) {
      names.set(`${moduleName}.${name}`, `${kind} ${moduleName}.${name}`);
    }
  };
  for (const { moduleName, unit } of domainModels) {
    // Typings and runtime differ at times; missing lists are skipped.
    (unit.entities ?? []).forEach((entity) => add(moduleName, entity.name, "entity"));
    (unit.associations ?? []).forEach((association) => add(moduleName, association.name, "association"));
    (unit.crossAssociations ?? []).forEach((association) => add(moduleName, association.name, "association"));
  }
  for (const { moduleName, unit } of securities) {
    (unit.moduleRoles ?? []).forEach((role) => add(moduleName, role.name, "module role"));
  }
  console.info(`reserved names: ${names.size} entities, associations and module roles`);
  return names;
}
