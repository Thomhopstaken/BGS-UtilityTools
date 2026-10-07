import type {
  DomainModels,
  JavaActions,
  MLMappings,
  Microflows,
  Primitives,
  Rest,
  Workflows,
} from "@mendix/extensions-api";
import {
  type AssociationEnds,
  entityOfDataType,
  type FlowReferences,
  javaActionSignature,
  mlOutputEntity,
  ReferenceCache,
  restOperationEntity,
  workflowContextEntity,
} from "./ReferenceCache";

export interface ResolveAccess {
  resolve<TElement extends Primitives.ElementBase>(type: TElement["$Type"], qualifiedName: string): Promise<TElement | null>;
}

export interface DomainModelLookup extends ResolveAccess {
  getUnitsInfo(): Promise<ReadonlyArray<Readonly<Primitives.UnitInfo>>>;
  loadAll(
    filter: (info: Primitives.UnitInfo) => boolean,
    maxUnitsToLoad?: number,
  ): Promise<DomainModels.DomainModel[]>;
}

// Model APIs used to resolve documents that microflow actions reference by qualified name.
export type ReferenceApis = {
  microflows: ResolveAccess;
  domainModels: DomainModelLookup;
  javaActions: ResolveAccess;
  workflows: ResolveAccess;
  consumedRestServices: ResolveAccess;
  mlMappingDocuments: ResolveAccess;
};

// Resolves referenced documents lazily, at most once per qualified name, into the shared cache.
export class ReferenceResolver {
  private readonly apis: ReferenceApis;
  private readonly cache: ReferenceCache;
  // All associations by qualified name, loaded once when resolve() cannot find one.
  private associationFallback: Map<string, AssociationEnds> | null = null;

  constructor(apis: ReferenceApis, cache: ReferenceCache) {
    this.apis = apis;
    this.cache = cache;
  }

  async resolveAll(refs: FlowReferences): Promise<void> {
    const cache = this.cache;
    for (const qName of refs.associations) {
      if (!cache.associations.has(qName)) {
        cache.associations.set(qName, await this.resolveAssociation(qName));
      }
    }
    for (const qName of refs.microflows) {
      if (!cache.microflowReturnEntities.has(qName)) {
        const called = await tryResolve(qName, () =>
          this.apis.microflows.resolve<Microflows.Microflow>("Microflows$Microflow", qName),
        );
        cache.microflowReturnEntities.set(qName, entityOfDataType(called?.microflowReturnType));
      }
    }
    for (const qName of refs.javaActions) {
      if (!cache.javaActions.has(qName)) {
        const javaAction = await tryResolve(qName, () =>
          this.apis.javaActions.resolve<JavaActions.JavaAction>("JavaActions$JavaAction", qName),
        );
        cache.javaActions.set(qName, javaAction === null ? null : javaActionSignature(javaAction));
      }
    }
    for (const qName of refs.workflows) {
      if (!cache.workflowContextEntities.has(qName)) {
        const workflow = await tryResolve(qName, () =>
          this.apis.workflows.resolve<Workflows.Workflow>("Workflows$Workflow", qName),
        );
        cache.workflowContextEntities.set(qName, workflow === null ? null : workflowContextEntity(workflow));
      }
    }
    for (const qName of refs.restOperations) {
      if (!cache.restOperationEntities.has(qName)) {
        const operation = await this.resolveRestOperation(qName);
        cache.restOperationEntities.set(qName, operation === null ? null : restOperationEntity(operation));
      }
    }
    for (const qName of refs.mlMappings) {
      if (!cache.mlOutputEntities.has(qName)) {
        const mapping = await tryResolve(qName, () =>
          this.apis.mlMappingDocuments.resolve<MLMappings.MLMappingDocument>("MLMappings$MLMappingDocument", qName),
        );
        cache.mlOutputEntities.set(qName, mapping === null ? null : mlOutputEntity(mapping));
      }
    }
  }

  // UNVERIFIED: resolve() on non-unit elements; falls back to loading all domain models once.
  private async resolveAssociation(qName: string): Promise<AssociationEnds | null> {
    const domainModels = this.apis.domainModels;
    const association =
      (await tryResolve(qName, () =>
        domainModels.resolve<DomainModels.Association>("DomainModels$Association", qName),
      )) ??
      (await tryResolve(qName, () =>
        domainModels.resolve<DomainModels.CrossAssociation>("DomainModels$CrossAssociation", qName),
      ));
    if (association !== null) {
      console.debug(`resolved association ${qName}: parent=${association.parent}, child=${association.child}`);
      return { parent: association.parent, child: association.child };
    }
    if (this.associationFallback === null) {
      console.info(`association ${qName} not resolvable, loading all domain models`);
      this.associationFallback = await loadAssociationEnds(domainModels);
    }
    return this.associationFallback.get(qName) ?? null;
  }

  // UNVERIFIED: the operation reference is assumed to be "<service qualified name>.<operation name>".
  private async resolveRestOperation(qName: string): Promise<Rest.RestOperation | null> {
    const separator = qName.lastIndexOf(".");
    if (separator <= 0) {
      console.debug(`rest operation reference ${qName} has no service part`);
      return null;
    }
    const serviceName = qName.slice(0, separator);
    const operationName = qName.slice(separator + 1);
    const service = await tryResolve(serviceName, () =>
      this.apis.consumedRestServices.resolve<Rest.ConsumedRestService>("Rest$ConsumedRestService", serviceName),
    );
    const operation = service?.operations.find((o) => o.name === operationName) ?? null;
    console.debug(
      `rest operation ${qName}: service ${service === null ? "not found" : "found"}, operation ${operation?.name}`,
    );
    return operation;
  }
}

// Loads every domain model, marketplace ones included, and keeps only the association ends.
export async function loadAssociationEnds(domainModels: DomainModelLookup): Promise<Map<string, AssociationEnds>> {
  const infos = await domainModels.getUnitsInfo();
  const moduleById = new Map(infos.map((info) => [info.$ID, info.moduleName]));
  const units = await domainModels.loadAll((info) => info.$Type === "DomainModels$DomainModel", infos.length);
  const ends = new Map<string, AssociationEnds>();
  for (const domainModel of units) {
    const moduleName = moduleById.get(domainModel.$ID);
    if (moduleName === undefined) {
      console.debug(`no module found for domain model ${domainModel.$ID}`);
      continue;
    }
    for (const association of [...domainModel.associations, ...domainModel.crossAssociations]) {
      ends.set(`${moduleName}.${association.name}`, { parent: association.parent, child: association.child });
    }
  }
  console.info(`loaded ${ends.size} associations from ${units.length} domain models`);
  return ends;
}

async function tryResolve<T>(qName: string, resolver: () => Promise<T | null>): Promise<T | null> {
  try {
    const result = await resolver();
    console.debug(`resolve ${qName}: ${result === null ? "not found" : "found"}`);
    return result;
  } catch (error: unknown) {
    console.debug(`could not resolve ${qName}: ${error}`);
    return null;
  }
}
