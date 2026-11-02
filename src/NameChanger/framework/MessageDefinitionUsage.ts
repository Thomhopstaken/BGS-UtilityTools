// Which import and export mappings use which message definitions, and which definitions use the entity, by qualified
// name as found before any rename. Filled by the mapping and message definition planners; read for the run log,
// because a changed message definition forces its mappings to be updated to the new schema in Studio Pro, which
// clears them.
export class MessageDefinitionUsage {
  private readonly mappingsByDefinition = new Map<string, Set<string>>();
  private readonly entityDefinitions = new Set<string>();

  // definition: a mapping's messageDefinition (Module.Collection.Definition) or messageDefinition2 (Module.Document).
  add(definition: string, mapping: string): void {
    let mappings = this.mappingsByDefinition.get(definition);
    if (mappings === undefined) {
      mappings = new Set<string>();
      this.mappingsByDefinition.set(definition, mappings);
    }
    if (!mappings.has(mapping)) {
      mappings.add(mapping);
      console.debug(`message definition ${definition} used by mapping ${mapping}`);
    }
  }

  // definition: Module.Collection.Definition or Module.Document, exposing the entity.
  addEntityDefinition(definition: string): void {
    if (!this.entityDefinitions.has(definition)) {
      this.entityDefinitions.add(definition);
      console.debug(`message definition ${definition} uses the entity`);
    }
  }

  // Mappings using a definition that uses the entity: the standalone definition `qname`, or any such definition
  // inside the collection `qname`.
  // UNVERIFIED: a definition inside a collection is referenced as Module.Collection.Definition.
  mappingsOf(qname: string): string[] {
    const mappings = new Set<string>();
    for (const [definition, users] of this.mappingsByDefinition) {
      if (this.entityDefinitions.has(definition) && (definition === qname || definition.startsWith(`${qname}.`))) {
        users.forEach((mapping) => mappings.add(mapping));
      }
    }
    console.debug(`message definition ${qname}: ${mappings.size} mappings use a definition of the entity`);
    return [...mappings].sort();
  }
}
