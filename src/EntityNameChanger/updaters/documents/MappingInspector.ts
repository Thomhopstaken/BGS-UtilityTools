import type { ExportMappings, ImportMappings, Primitives } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { entityOfDataType } from "../microflows/ReferenceCache";
import { walkElements } from "../shared/elementWalker";
import { type DocumentInspector, type LocalRenames, NO_LOCAL_RENAMES } from "./DocumentUpdater";

export type MappingDocument = ImportMappings.ImportMapping | ExportMappings.ExportMapping;

// Import and export mappings: renamed when an object element maps the entity. The export mapping parameter is
// renamed too. JSON structures used by an entity mapping are collected for the JSON structure planner.
export class MappingInspector implements DocumentInspector<MappingDocument> {
  private readonly context: RenameContext;
  private readonly naming: NamingPolicy;
  // Qualified names of JSON structures used by a mapping of the entity; shared with JsonStructureInspector.
  private readonly usedJsonStructures: Set<string>;

  constructor(context: RenameContext, naming: NamingPolicy, usedJsonStructures: Set<string>) {
    this.context = context;
    this.naming = naming;
    this.usedJsonStructures = usedJsonStructures;
  }

  usesEntity(mapping: MappingDocument, _info?: Readonly<Primitives.UnitInfo>): boolean {
    let found = mapping.$Type === "ImportMappings$ImportMapping" && this.isEntity(entityOfDataType(mapping.parameterType));
    if (!found) {
      walkElements(mapping.rootMappingElements, (element) => {
        found ||= element.$Type.endsWith("ObjectMappingElement") && this.isEntity(element.entity as string | null);
      });
    }
    if (found && mapping.jsonStructure !== null && mapping.jsonStructure !== undefined) {
      console.debug(`mapping ${mapping.name} uses JSON structure ${mapping.jsonStructure}`);
      this.usedJsonStructures.add(mapping.jsonStructure);
    }
    return found;
  }

  // Export mappings only; no caller references the parameter by name.
  // UNVERIFIED: parameterName is not referenced anywhere else.
  planLocalRenames(mapping: MappingDocument): LocalRenames {
    if (mapping.$Type !== "ExportMappings$ExportMapping") {
      return NO_LOCAL_RENAMES;
    }
    if (!mapping.rootMappingElements.some((root) => this.isEntity(root.entity))) {
      return NO_LOCAL_RENAMES;
    }
    const newName = this.naming.rename(mapping.parameterName);
    if (newName === mapping.parameterName) {
      return NO_LOCAL_RENAMES;
    }
    console.debug(`export mapping ${mapping.name}: rename parameter '${mapping.parameterName}' -> '${newName}'`);
    return { renames: new Map([[mapping.parameterName, newName]]), referencedByCallers: false };
  }

  apply(mapping: MappingDocument, local: LocalRenames): number {
    if (mapping.$Type !== "ExportMappings$ExportMapping") {
      return 0;
    }
    const newName = local.renames.get(mapping.parameterName);
    if (newName === undefined) {
      return 0;
    }
    console.debug(`applying parameter rename '${mapping.parameterName}' -> '${newName}'`);
    mapping.parameterName = newName;
    return 1;
  }

  private isEntity(qname: string | null | undefined): boolean {
    return isEntityQname(qname, this.context);
  }
}
