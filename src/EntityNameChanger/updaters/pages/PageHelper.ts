import type { Pages } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { entityOfDataType } from "../microflows/ReferenceCache";
import { rewriteExpression } from "../shared/variableRewrite";
import { type ModelElement, walkElements } from "../shared/elementWalker";
import { rewriteUrlPlaceholders } from "../shared/urlPlaceholders";

export type PageDocument = Pages.Page | Pages.Snippet;
type DocumentParameter = Pages.PageParameter | Pages.SnippetParameter;

// Properties holding an expression or XPath on any page element; `$Param` tokens are rewritten.
const EXPRESSION_PROPERTIES = [
  "expression",
  "argument",
  "numberOfPagesToClose",
  "numberOfPagesToClose2",
  "dynamicClasses",
  "xPathConstraint",
] as const;

// defaultValue is only an expression on these; on search fields and widget types it is a literal.
const DEFAULT_VALUE_EXPRESSION_TYPES = new Set(["Pages$PageParameter", "Pages$LocalVariable"]);

// Local references to a page or snippet parameter, by name.
// UNVERIFIED: bare name or qualified (Module.Page.Param); both forms are handled.
const PARAMETER_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  Pages$PageVariable: ["pageParameter", "snippetParameter"],
  Pages$ParameterAttributeUrlSegment: ["pageParameter"],
};

// Properties holding an entity qualified name, and those holding a member name (Module.Entity.Member).
const ENTITY_PROPERTIES = ["entity", "destinationEntity", "specialization"] as const;
const MEMBER_PROPERTIES = ["attribute"] as const;

// Renames entity-typed page/snippet parameters and their usages within the same document.
// Cross-document references (parameter mappings in callers) are left to the reference pass.
export class PageHelper {
  readonly entityQname: string;
  readonly context: RenameContext;
  readonly naming: NamingPolicy;
  // Per-document state, cleared by reset().
  readonly renames = new Map<string, string>();
  skippedRenames = 0;
  private entityParameters: DocumentParameter[] = [];

  constructor(context: RenameContext, naming: NamingPolicy) {
    this.entityQname = context.oldQualifiedName;
    this.context = context;
    this.naming = naming;
    console.info(`PageHelper for ${this.entityQname} -> ${context.newName}`);
  }

  reset(): void {
    this.renames.clear();
    this.entityParameters = [];
    this.skippedRenames = 0;
    console.debug("PageHelper state reset");
  }

  // Finds entity-typed parameters and registers renames for those whose name contains the entity name.
  detectParameters(doc: PageDocument): void {
    this.entityParameters = doc.parameters.filter((p) => this.isEntityQname(entityOfDataType(p.parameterType)));
    console.debug(`${doc.name}: ${this.entityParameters.length} entity parameters`);
    if (!this.entityParameters.some((p) => this.naming.contains(p.name))) {
      return;
    }
    const declared = this.collectDeclaredNames(doc);
    for (const parameter of this.entityParameters) {
      const newName = this.naming.rename(parameter.name);
      if (newName === parameter.name) {
        continue;
      }
      // Taken by a declared name or by another parameter's new name.
      const clash = declared.has(newName) || [...this.renames.values()].includes(newName);
      if (clash) {
        console.info(`skipped rename of parameter '${parameter.name}' -> '${newName}' in ${doc.name}: name already in use`);
        this.skippedRenames++;
        continue;
      }
      console.debug(`rename parameter '${parameter.name}' -> '${newName}'`);
      this.renames.set(parameter.name, newName);
    }
  }

  applyRenames(): void {
    for (const parameter of this.entityParameters) {
      const newName = this.renames.get(parameter.name);
      if (newName !== undefined) {
        console.debug(`applying parameter rename '${parameter.name}' -> '${newName}'`);
        parameter.name = newName;
      }
    }
  }

  // Rewrites every usage of a renamed parameter in the document; returns the number of changed values.
  updateUsages(doc: PageDocument): number {
    if (this.renames.size === 0) {
      return 0;
    }
    let changes = 0;
    walkElements(doc, (element) => {
      changes += this.updateElement(element);
    });
    console.debug(`${doc.name}: ${changes} usages updated`);
    return changes;
  }

  // An entity-typed parameter, or any reference to the entity or one of its members.
  usesEntity(doc: PageDocument): boolean {
    if (this.entityParameters.length > 0) {
      return true;
    }
    if (doc.$Type === "Pages$Page" && this.isEntityQname(doc.parameter)) {
      return true;
    }
    let found = false;
    walkElements(doc, (element) => {
      found ||= this.referencesEntity(element);
    });
    return found;
  }

  shouldRenameDocument(doc: PageDocument): boolean {
    const rename = this.naming.contains(doc.name) && this.usesEntity(doc);
    console.debug(`document ${doc.name}: rename=${rename}`);
    return rename;
  }

  private updateElement(element: ModelElement): number {
    let changes = 0;
    const update = (property: string, rewrite: (value: string) => string) => {
      const value = element[property];
      if (typeof value !== "string") {
        return;
      }
      const newValue = rewrite(value);
      if (newValue !== value) {
        element[property] = newValue;
        changes++;
      }
    };
    for (const property of EXPRESSION_PROPERTIES) {
      update(property, (value) => rewriteExpression(value, this.renames));
    }
    if (DEFAULT_VALUE_EXPRESSION_TYPES.has(element.$Type)) {
      update("defaultValue", (value) => rewriteExpression(value, this.renames));
    }
    for (const property of PARAMETER_REFERENCES[element.$Type] ?? []) {
      update(property, (value) => this.rewriteParameterReference(value));
    }
    if (element.$Type === "Pages$Page") {
      update("url", (value) => this.rewriteUrl(value));
    }
    return changes;
  }

  // Replaces the last segment, so bare and qualified references are both handled.
  private rewriteParameterReference(value: string): string {
    const dot = value.lastIndexOf(".");
    const newName = this.renames.get(value.slice(dot + 1));
    if (newName === undefined) {
      return value;
    }
    const newValue = value.slice(0, dot + 1) + newName;
    console.debug(`updated parameter reference '${value}' to '${newValue}'`);
    return newValue;
  }

  private rewriteUrl(url: string): string {
    return rewriteUrlPlaceholders(url, this.renames);
  }

  private referencesEntity(element: ModelElement): boolean {
    const isEntity = ENTITY_PROPERTIES.some((p) => this.isEntityQname(element[p] as string | undefined));
    const isMember = MEMBER_PROPERTIES.some((p) => {
      const value = element[p];
      if (typeof value !== "string") {
        return false;
      }
      return this.isEntityQname(value.slice(0, value.lastIndexOf(".")));
    });
    if (isEntity || isMember) {
      console.debug(`${element.$Type} references ${this.entityQname}`);
    }
    return isEntity || isMember;
  }

  private isEntityQname(qname: string | null | undefined): boolean {
    return isEntityQname(qname, this.context);
  }

  // Parameters, variables and every named element (widgets) in the document, the document itself excluded.
  private collectDeclaredNames(doc: PageDocument): Set<string> {
    const names = new Set<string>();
    walkElements(doc, (element) => {
      if (element !== (doc as unknown) && typeof element.name === "string" && element.name.length > 0) {
        names.add(element.name);
      }
    });
    doc.parameters.forEach((p) => names.add(p.name));
    doc.variables.forEach((v) => names.add(v.name));
    console.debug(`${doc.name}: ${names.size} declared names`);
    return names;
  }
}
