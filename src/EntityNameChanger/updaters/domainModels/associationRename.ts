import type { DomainModels } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";

export type AnyAssociation = DomainModels.Association | DomainModels.CrossAssociation;

export type AssociationRename = { id: string; oldName: string; newName: string };

export function associationsOf(domainModel: DomainModels.DomainModel): AnyAssociation[] {
  return [...(domainModel.associations ?? []), ...(domainModel.crossAssociations ?? [])];
}

// UNVERIFIED: parent/child may be an $ID or a qualified name, so both are checked.
export function isConnectedAssociation(association: AnyAssociation, context: RenameContext): boolean {
  const isEntity = (ref: string) => ref === context.entityId || isEntityQname(ref, context);
  return isEntity(association.parent) || isEntity(association.child);
}

// New name for a connected association, null when it is not connected or keeps its name.
export function proposedAssociationName(
  association: AnyAssociation,
  context: RenameContext,
  naming: NamingPolicy,
): string | null {
  if (!isConnectedAssociation(association, context)) {
    return null;
  }
  const newName = naming.rename(association.name);
  return newName === association.name ? null : newName;
}

// Names an association can't take in its domain model: other associations and entities (one name group).
// In the entity's own domain model the entity counts with its old and new name.
export class AssociationNames {
  private readonly names = new Set<string>();

  constructor(domainModel: DomainModels.DomainModel, context: RenameContext) {
    for (const association of associationsOf(domainModel)) {
      this.names.add(association.name);
    }
    for (const entity of domainModel.entities ?? []) {
      this.names.add(entity.name);
    }
    if (domainModel.$ID === context.domainModelId) {
      this.names.add(context.newName);
    }
  }

  isFree(name: string): boolean {
    return !this.names.has(name);
  }

  register(oldName: string, newName: string): void {
    this.names.delete(oldName);
    this.names.add(newName);
  }
}

// Renames the planned associations (association id -> new name) in memory; returns what was renamed.
export function applyAssociationRenames(
  domainModel: DomainModels.DomainModel,
  renames: ReadonlyMap<string, string>,
): AssociationRename[] {
  const applied: AssociationRename[] = [];
  for (const association of associationsOf(domainModel)) {
    const newName = renames.get(association.$ID);
    if (newName === undefined || newName === association.name) {
      continue;
    }
    console.info(`renaming association ${association.name} to ${newName}`);
    applied.push({ id: association.$ID, oldName: association.name, newName });
    association.name = newName;
  }
  if (applied.length !== renames.size) {
    console.info(`domain model ${domainModel.$ID}: ${applied.length} of ${renames.size} planned association renames applied`);
  }
  return applied;
}
