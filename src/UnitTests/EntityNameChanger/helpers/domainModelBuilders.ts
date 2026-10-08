import type { DomainModels } from "@mendix/extensions-api";

// Test-only builders for domain models with associations; plain objects cast to the Mendix types.

export type FakeAssociation = { $Type: string; $ID: string; name: string; parent: string; child: string };

export function association(id: string, name: string, parent: string, child: string): FakeAssociation {
  return { $Type: "DomainModels$Association", $ID: id, name, parent, child };
}

export function crossAssociation(id: string, name: string, parent: string, child: string): FakeAssociation {
  return { $Type: "DomainModels$CrossAssociation", $ID: id, name, parent, child };
}

export function domainModelWith(
  id: string,
  options: { entities?: string[]; associations?: FakeAssociation[]; crossAssociations?: FakeAssociation[] } = {},
): DomainModels.DomainModel {
  return {
    $Type: "DomainModels$DomainModel",
    $ID: id,
    entities: (options.entities ?? []).map((name, index) => ({ $Type: "DomainModels$Entity", $ID: `${id}-e${index}`, name })),
    associations: options.associations ?? [],
    crossAssociations: options.crossAssociations ?? [],
  } as unknown as DomainModels.DomainModel;
}
