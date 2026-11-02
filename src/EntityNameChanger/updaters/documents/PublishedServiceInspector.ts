import type { ODataPublish, Primitives, Rest, WebServices } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import type { QualifiedNameRenames } from "../../framework/QualifiedNameRenames";
import type { RenameContext } from "../../framework/RenameContext";
import { type ModelElement, walkElements } from "../shared/elementWalker";
import { findReferencedName } from "../shared/qualifiedNameRewrite";
import { rewriteUrlPlaceholders } from "../shared/urlPlaceholders";
import {
  applyNamedRenames,
  type DocumentInspector,
  type LocalRenames,
  NO_LOCAL_RENAMES,
  planNamedRenames,
} from "./DocumentUpdater";

export type PublishedServiceDocument =
  | Rest.PublishedRestService
  | ODataPublish.PublishedODataService2
  | WebServices.PublishedWebService;

// Exposed-name properties on any element of a published service.
const EXPOSED_PROPERTIES: readonly string[] = [
  "exposedName",
  "alternativeExposedName",
  "exposedAssociationName",
  "exposedItemName",
  "entityExposedName",
  "entityExposedItemName",
];

// Element types whose `name` is exposed. REST operation parameters are renamed separately, with their path placeholders.
const EXPOSED_NAME_TYPES: ReadonlySet<string> = new Set(["Rest$PublishedRestServiceResource", "WebServices$PublishedOperation"]);

// Element types whose `serviceName` is exposed.
const EXPOSED_SERVICE_NAME_TYPES: ReadonlySet<string> = new Set(["Rest$PublishedRestService"]);

// Published REST, OData and web services: renamed when they reference the entity or a renamed document. Exposed names
// are renamed only on opt-in (context.renameExposedNames): they are the published API. Of a path, only the
// `{Param}` placeholders of renamed REST operation parameters change; literal text, namespaces and versions never do.
export class PublishedServiceInspector implements DocumentInspector<PublishedServiceDocument> {
  private readonly context: RenameContext;
  private readonly naming: NamingPolicy;
  // Seeded with the entity; filled with renamed documents by the planners that run before this one.
  private readonly renames: QualifiedNameRenames;
  // Counts of the last apply; read by exposedNameCounts.
  private lastCounts = { renamed: 0, skipped: 0 };

  constructor(context: RenameContext, naming: NamingPolicy, renames: QualifiedNameRenames) {
    this.context = context;
    this.naming = naming;
    this.renames = renames;
  }

  usesEntity(service: PublishedServiceDocument, _info?: Readonly<Primitives.UnitInfo>): boolean {
    const renamed = new Set([...this.renames.map.keys(), this.context.newQualifiedName]);
    let found: string | null = null;
    walkElements(service, (element) => {
      if (found !== null) {
        return;
      }
      for (const [key, value] of Object.entries(element)) {
        if (!key.startsWith("$") && typeof value === "string") {
          found = findReferencedName(value, renamed);
          if (found !== null) {
            return;
          }
        }
      }
    });
    console.debug(`published service ${service.name}: uses entity=${found !== null}${found === null ? "" : ` (${found})`}`);
    return found !== null;
  }

  planLocalRenames(): LocalRenames {
    return NO_LOCAL_RENAMES;
  }

  // With the opt-in, apply renames exposed names; whether the service uses the entity is decided then, against the
  // complete rename map, so every service is loaded in the rename phase.
  changesBeyondRenames(): boolean {
    return this.context.renameExposedNames;
  }

  apply(service: PublishedServiceDocument, _local: LocalRenames): number {
    this.lastCounts = { renamed: 0, skipped: 0 };
    if (!this.context.renameExposedNames) {
      console.debug(`published service ${service.name}: exposed names kept (not opted in)`);
      return 0;
    }
    if (!this.usesEntity(service)) {
      return 0;
    }
    const slots = exposedSlots(service);
    // Values in use per property, so a rename onto an existing exposed name is skipped.
    const taken = new Map<string, Set<string>>();
    for (const { element, property } of slots) {
      const values = taken.get(property) ?? new Set<string>();
      values.add(element[property] as string);
      taken.set(property, values);
    }
    for (const { element, property } of slots) {
      const value = element[property] as string;
      const newValue = this.naming.rename(value);
      if (newValue === value) {
        continue;
      }
      const values = taken.get(property)!;
      if (values.has(newValue)) {
        console.info(`published service ${service.name}: skipped ${property} '${value}': '${newValue}' already exists`);
        this.lastCounts.skipped++;
        continue;
      }
      console.debug(`published service ${service.name}: ${property} '${value}' -> '${newValue}'`);
      values.delete(value);
      values.add(newValue);
      element[property] = newValue;
      this.lastCounts.renamed++;
    }
    this.renameOperationParameters(service);
    console.info(`published service ${service.name}: ${this.lastCounts.renamed} exposed names renamed, ${this.lastCounts.skipped} skipped`);
    return this.lastCounts.renamed;
  }

  exposedNameCounts(): { renamed: number; skipped: number } {
    return { ...this.lastCounts };
  }

  // REST operation parameters holding the entity name, with their `{Param}` placeholders in the operation path.
  // A name taken by another parameter of the operation is skipped. microflowParameter mappings are qualified names
  // of the microflow's parameters and stay as they are.
  private renameOperationParameters(service: PublishedServiceDocument): void {
    walkElements(service, (element) => {
      if (element.$Type !== "Rest$PublishedRestServiceOperation" || !Array.isArray(element.parameters)) {
        return;
      }
      const parameters = element.parameters as { name: string }[];
      const local = planNamedRenames(`operation ${String(element.path)}`, parameters, () => true, this.naming, false);
      this.lastCounts.skipped += local.skipped ?? 0;
      if (local.renames.size === 0) {
        return;
      }
      this.lastCounts.renamed += applyNamedRenames(parameters, local);
      if (typeof element.path === "string") {
        element.path = rewriteUrlPlaceholders(element.path, local.renames);
      }
    });
  }
}

// Every exposed-name string property in the service.
function exposedSlots(service: PublishedServiceDocument): { element: ModelElement; property: string }[] {
  const slots: { element: ModelElement; property: string }[] = [];
  walkElements(service, (element) => {
    const properties = [...EXPOSED_PROPERTIES];
    if (EXPOSED_NAME_TYPES.has(element.$Type)) {
      properties.push("name");
    }
    if (EXPOSED_SERVICE_NAME_TYPES.has(element.$Type)) {
      properties.push("serviceName");
    }
    for (const property of properties) {
      if (typeof element[property] === "string" && (element[property] as string).length > 0) {
        slots.push({ element, property });
      }
    }
  });
  return slots;
}
