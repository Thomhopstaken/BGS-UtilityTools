import type { MessageDefinitions, Primitives } from "@mendix/extensions-api";
import { qualifiedName } from "../../framework/DocumentRenamePlan";
import type { MessageDefinitionUsage } from "../../framework/MessageDefinitionUsage";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { walkElements } from "../shared/elementWalker";
import { applyNamedRenames, type DocumentInspector, type LocalRenames, NO_LOCAL_RENAMES, planNamedRenames } from "./DocumentUpdater";

export type MessageDefinitionDocument = MessageDefinitions.MessageDefinitionCollection | MessageDefinitions.MessageDefinition2;

const EXPOSED_ENTITY_TYPES: ReadonlySet<string> = new Set(["MessageDefinitions$ExposedEntity", "MessageDefinitions$ExposedAssociation"]);

// Message definition collections and standalone message definitions: renamed when they expose the entity. In a
// collection, the definitions of the entity are renamed too. Exposed names are an external contract and are kept.
export class MessageDefinitionInspector implements DocumentInspector<MessageDefinitionDocument> {
  private readonly context: RenameContext;
  private readonly naming: NamingPolicy;

  // Definitions that use the entity; read for the run log.
  private readonly messageDefinitionUsage: MessageDefinitionUsage;

  constructor(context: RenameContext, naming: NamingPolicy, messageDefinitionUsage: MessageDefinitionUsage) {
    this.context = context;
    this.naming = naming;
    this.messageDefinitionUsage = messageDefinitionUsage;
  }

  usesEntity(document: MessageDefinitionDocument, info?: Readonly<Primitives.UnitInfo>): boolean {
    const documentName = qualifiedName(info?.moduleName, document.name);
    let found = false;
    if (document.$Type === "MessageDefinitions$MessageDefinitionCollection") {
      for (const definition of document.messageDefinitions) {
        if (this.exposesEntity(definition)) {
          found = true;
          this.recordEntityDefinition(documentName === undefined ? undefined : `${documentName}.${definition.name}`);
        }
      }
    } else if (this.exposesEntity(document)) {
      found = true;
      this.recordEntityDefinition(documentName);
    }
    console.debug(`message definition ${document.name}: uses entity=${found}`);
    return found;
  }

  // Collections only: definitions rooted at the entity. Mappings reference them as Module.Collection.Definition.
  // UNVERIFIED: the Module.Collection.Definition format of a mapping's messageDefinition.
  planLocalRenames(document: MessageDefinitionDocument): LocalRenames {
    if (document.$Type !== "MessageDefinitions$MessageDefinitionCollection") {
      return NO_LOCAL_RENAMES;
    }
    return planNamedRenames(
      `message definition collection ${document.name}`,
      document.messageDefinitions,
      (definition) => this.isEntityDefinition(definition),
      this.naming,
      true,
    );
  }

  apply(document: MessageDefinitionDocument, local: LocalRenames): number {
    if (document.$Type !== "MessageDefinitions$MessageDefinitionCollection") {
      return 0;
    }
    const changes = applyNamedRenames(document.messageDefinitions, local);
    console.debug(`message definition collection ${document.name}: ${changes} definitions renamed`);
    return changes;
  }

  private exposesEntity(root: object): boolean {
    let found = false;
    walkElements(root, (element) => {
      found ||= EXPOSED_ENTITY_TYPES.has(element.$Type) && this.isEntity(element.entity as string | null);
    });
    return found;
  }

  private recordEntityDefinition(definition: string | undefined): void {
    if (definition !== undefined) {
      this.messageDefinitionUsage.addEntityDefinition(definition);
    }
  }

  private isEntityDefinition(definition: MessageDefinitions.MessageDefinition): boolean {
    return (
      definition.$Type === "MessageDefinitions$EntityMessageDefinition" &&
      this.isEntity((definition as MessageDefinitions.EntityMessageDefinition).exposedEntity?.entity)
    );
  }

  private isEntity(qname: string | null | undefined): boolean {
    return isEntityQname(qname, this.context);
  }
}
