import type { ExportMappings, ImportMappings, Primitives } from "@mendix/extensions-api";
import { qualifiedName } from "../../framework/DocumentRenamePlan";
import type { MessageDefinitionUsage } from "../../framework/MessageDefinitionUsage";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { entityOfDataType } from "../microflows/ReferenceCache";
import { walkElements } from "../../../shared/rename/rewrite/elementWalker";
import { type DocumentInspector, type LocalRenames, NO_LOCAL_RENAMES } from "./DocumentUpdater";

export type MappingDocument = ImportMappings.ImportMapping | ExportMappings.ExportMapping;

// Import and export mappings: renamed when an object element maps the entity. The export mapping parameter is
// renamed too. JSON structures used by an entity mapping are collected for the JSON structure planner.
export class MappingInspector implements DocumentInspector<MappingDocument> {
  private readonly context: RenameContext;
  private readonly naming: NamingPolicy;
  // Qualified names of JSON structures used by a mapping of the entity; shared with JsonStructureInspector.
  private readonly usedJsonStructures: Set<string>;
  // Every mapping's message definition, entity or not; read for the run log.
  private readonly messageDefinitionUsage: MessageDefinitionUsage;

  constructor(context: RenameContext, naming: NamingPolicy, usedJsonStructures: Set<string>, messageDefinitionUsage: MessageDefinitionUsage) {
    this.context = context;
    this.naming = naming;
    this.usedJsonStructures = usedJsonStructures;
    this.messageDefinitionUsage = messageDefinitionUsage;
  }

  usesEntity(mapping: MappingDocument, info?: Readonly<Primitives.UnitInfo>): boolean {
    this.recordMessageDefinition(mapping, info);
    let found = mapping.$Type === "ImportMappings$ImportMapping" && this.isEntity(entityOfDataType(mapping.parameterType));
    if (!found) {
      // Matches import and export object mapping elements.
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

  // Records the mapping under each message definition it uses (messageDefinition and messageDefinition2).
  private recordMessageDefinition(mapping: MappingDocument, info: Readonly<Primitives.UnitInfo> | undefined): void {
    const mappingName = qualifiedName(info?.moduleName, mapping.name);
    if (mappingName === undefined) {
      return;
    }
    for (const definition of [mapping.messageDefinition, mapping.messageDefinition2]) {
      if (typeof definition === "string" && definition.length > 0) {
        this.messageDefinitionUsage.add(definition, mappingName);
      }
    }
  }

  private isEntity(qname: string | null | undefined): boolean {
    return isEntityQname(qname, this.context);
  }
}
