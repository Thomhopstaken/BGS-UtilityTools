import type { DomainModels, Primitives } from "@mendix/extensions-api";
import { qualifiedName } from "../../framework/DocumentRenamePlan";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { type DocumentInspector, type LocalRenames, NO_LOCAL_RENAMES } from "./DocumentUpdater";

// View entity source documents (OQL): only the renamed view entity's own source is renamed, with it. The OQL of every
// source document is rewritten by the reference pass; other view entities keep their names.
// UNVERIFIED: a source document has the same name as its view entity.
export class ViewEntitySourceInspector implements DocumentInspector<DomainModels.ViewEntitySourceDocument> {
  private readonly context: RenameContext;

  constructor(context: RenameContext) {
    this.context = context;
  }

  // True only for the renamed entity's own source document.
  usesEntity(document: DomainModels.ViewEntitySourceDocument, info?: Readonly<Primitives.UnitInfo>): boolean {
    const found = isEntityQname(qualifiedName(info?.moduleName, document.name), this.context);
    console.debug(`view entity source ${info?.moduleName}.${document.name}: source of the entity=${found}`);
    return found;
  }

  planLocalRenames(_document: DomainModels.ViewEntitySourceDocument): LocalRenames {
    return NO_LOCAL_RENAMES;
  }

  apply(_document: DomainModels.ViewEntitySourceDocument, _local: LocalRenames): number {
    return 0;
  }
}
