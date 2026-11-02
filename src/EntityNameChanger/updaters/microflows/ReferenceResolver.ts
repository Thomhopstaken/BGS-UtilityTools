import type {
  ConnectorKit,
  DatabaseConnector,
  DomainModels,
  ExcelDataImporter,
  JavaActions,
  JavaScriptActions,
  MLMappings,
  Microflows,
  Primitives,
  Rest,
  Workflows,
} from "@mendix/extensions-api";
import {
  type AssociationEnds,
  databaseQueryEntity,
  entityOfDataType,
  excelTemplateEntity,
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
  nanoflows: ResolveAccess;
  domainModels: DomainModelLookup;
  javaActions: ResolveAccess;
  javaScriptActions: ResolveAccess;
  workflows: ResolveAccess;
  consumedRestServices: ResolveAccess;
  mlMappingDocuments: ResolveAccess;
  databaseConnections: ResolveAccess;
  excelDataImporterTemplates: ResolveAccess;
  connectorTypes: ResolveAccess;
};

// Resolves referenced documents lazily, at most once per qualified name, into the shared cache. Runs in the plan phase
// only, before anything is renamed, so every name is resolved as the caller writes it.
export class ReferenceResolver {
  private readonly apis: ReferenceApis;
  private readonly cache: ReferenceCache;
  // All associations by qualified name, loaded once when resolve() cannot find one.
  private associationFallback: Map<string, AssociationEnds> | null = null;

  constructor(apis: ReferenceApis, cache: ReferenceCache) {
    this.apis = apis;
    this.cache = cache;
  }

  // Fills the cache from a document the plan phase loaded anyway, so its callers need no resolve(). Never overwrites.
  remember(unit: Primitives.UnitBase, info: Readonly<Primitives.UnitInfo>): void {
    if (info.moduleName === undefined || info.name === undefined) {
      return;
    }
    const qName = `${info.moduleName}.${info.name}`;
    const cache = this.cache;
    switch (unit.$Type) {
      case "Microflows$Microflow":
        setOnce(cache.microflowReturnEntities, qName, () => entityOfDataType((unit as Microflows.Microflow).microflowReturnType));
        break;
      case "Microflows$Nanoflow":
        setOnce(cache.nanoflowReturnEntities, qName, () => entityOfDataType((unit as Microflows.Nanoflow).microflowReturnType));
        break;
      case "JavaActions$JavaAction":
        setOnce(cache.javaActions, qName, () => javaActionSignature(unit as JavaActions.JavaAction));
        break;
      case "JavaScriptActions$JavaScriptAction":
        setOnce(cache.javaScriptActions, qName, () => javaActionSignature(unit as JavaScriptActions.JavaScriptAction));
        break;
      case "Workflows$Workflow":
        setOnce(cache.workflowContextEntities, qName, () => workflowContextEntity(unit as Workflows.Workflow));
        break;
      default:
        break;
    }
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
    for (const qName of refs.nanoflows) {
      if (!cache.nanoflowReturnEntities.has(qName)) {
        const called = await tryResolve(qName, () =>
          this.apis.nanoflows.resolve<Microflows.Nanoflow>("Microflows$Nanoflow", qName),
        );
        cache.nanoflowReturnEntities.set(qName, entityOfDataType(called?.microflowReturnType));
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
    for (const qName of refs.javaScriptActions) {
      if (!cache.javaScriptActions.has(qName)) {
        const javaScriptAction = await tryResolve(qName, () =>
          this.apis.javaScriptActions.resolve<JavaScriptActions.JavaScriptAction>(
            "JavaScriptActions$JavaScriptAction",
            qName,
          ),
        );
        cache.javaScriptActions.set(qName, javaScriptAction === null ? null : javaActionSignature(javaScriptAction));
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
    for (const qName of refs.databaseQueries) {
      if (!cache.databaseQueryEntities.has(qName)) {
        cache.databaseQueryEntities.set(qName, await this.resolveDatabaseQueryEntity(qName));
      }
    }
    for (const qName of refs.excelTemplates) {
      if (!cache.excelTemplateEntities.has(qName)) {
        const template = await tryResolve(qName, () =>
          this.apis.excelDataImporterTemplates.resolve<ExcelDataImporter.Template>("ExcelDataImporter$Template", qName),
        );
        cache.excelTemplateEntities.set(qName, template === null ? null : excelTemplateEntity(template));
      }
    }
    for (const qName of refs.connectorActions) {
      if (!cache.connectorActionEntities.has(qName)) {
        cache.connectorActionEntities.set(qName, await this.resolveConnectorActionEntity(qName));
      }
    }
  }

  // UNVERIFIED: the query reference is "<connection qualified name>.<query name>".
  private async resolveDatabaseQueryEntity(qName: string): Promise<string | null> {
    const parts = splitMember(qName);
    if (parts === null) {
      return null;
    }
    const connection = await tryResolve(parts.owner, () =>
      this.apis.databaseConnections.resolve<DatabaseConnector.DatabaseConnection>(
        "DatabaseConnector$DatabaseConnection",
        parts.owner,
      ),
    );
    const entity = connection === null ? null : databaseQueryEntity(connection, parts.member);
    console.debug(`database query ${qName}: entity ${entity}`);
    return entity;
  }

  // UNVERIFIED: the action reference is "<connector type qualified name>.<action name>". Type parameters are not resolved.
  private async resolveConnectorActionEntity(qName: string): Promise<string | null> {
    const parts = splitMember(qName);
    if (parts === null) {
      return null;
    }
    const connectorType = await tryResolve(parts.owner, () =>
      this.apis.connectorTypes.resolve<ConnectorKit.ConnectorType>("ConnectorKit$ConnectorType", parts.owner),
    );
    const javaActionName = connectorType?.connectorActions.find((a) => a.name === parts.member)?.javaAction ?? null;
    if (javaActionName === null) {
      console.debug(`connector action ${qName}: no Java action found`);
      return null;
    }
    const javaAction = await tryResolve(javaActionName, () =>
      this.apis.javaActions.resolve<JavaActions.JavaAction>("JavaActions$JavaAction", javaActionName),
    );
    const entity = javaAction === null ? null : javaActionSignature(javaAction).returnEntity;
    console.debug(`connector action ${qName}: Java action ${javaActionName}, entity ${entity}`);
    return entity;
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
    const parts = splitMember(qName);
    if (parts === null) {
      return null;
    }
    const serviceName = parts.owner;
    const operationName = parts.member;
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

function setOnce<T>(map: Map<string, T>, key: string, value: () => T): void {
  if (!map.has(key)) {
    map.set(key, value());
    console.debug(`reference cache: ${key} remembered from the plan`);
  }
}

// "Module.Owner.Member" -> owner "Module.Owner", member "Member"; null without an owner part.
function splitMember(qName: string): { owner: string; member: string } | null {
  const separator = qName.lastIndexOf(".");
  if (separator <= 0) {
    console.debug(`reference ${qName} has no owner part`);
    return null;
  }
  return { owner: qName.slice(0, separator), member: qName.slice(separator + 1) };
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
