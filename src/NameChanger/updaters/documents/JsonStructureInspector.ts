import type { JsonStructures, Primitives } from "@mendix/extensions-api";
import { qualifiedName } from "../../framework/DocumentRenamePlan";
import { type DocumentInspector, NO_LOCAL_RENAMES, type LocalRenames } from "./DocumentUpdater";

// JSON structures hold no entity reference; one uses the entity when a mapping of the entity uses it.
// Relies on the mapping planners running first (they fill usedJsonStructures).
export class JsonStructureInspector implements DocumentInspector<JsonStructures.JsonStructure> {
  // Decides by name alone, so planning never loads JSON structures (they can be large).
  readonly plansFromInfo = true;
  private readonly usedJsonStructures: ReadonlySet<string>;

  constructor(usedJsonStructures: ReadonlySet<string>) {
    this.usedJsonStructures = usedJsonStructures;
  }

  usesEntity(structure: JsonStructures.JsonStructure, info: Readonly<Primitives.UnitInfo>): boolean {
    const qname = qualifiedName(info.moduleName, structure.name);
    const used = qname !== undefined && this.usedJsonStructures.has(qname);
    console.debug(`JSON structure ${qname}: used by an entity mapping=${used}`);
    return used;
  }

  planLocalRenames(): LocalRenames {
    return NO_LOCAL_RENAMES;
  }

  apply(): number {
    return 0;
  }
}
