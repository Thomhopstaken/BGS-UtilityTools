import type { DataSets, Primitives } from "@mendix/extensions-api";
import type { NamingPolicy } from "../../framework/NamingPolicy";
import { isEntityQname, type RenameContext } from "../../framework/RenameContext";
import { entityOfDataType } from "../microflows/ReferenceCache";
import { walkElements } from "../shared/elementWalker";
import { referencesQualifiedName } from "../shared/qualifiedNameRewrite";
import { rewriteExpression, rewriteName } from "../shared/variableRewrite";
import { applyNamedRenames, type DocumentInspector, type LocalRenames, planNamedRenames } from "./DocumentUpdater";

// Datasets: renamed when a parameter or Java source column is of the entity's type, or the OQL query uses the entity.
// Parameters of the entity's type named after it are renamed, with their usages. No document references a dataset
// in the API, so callers (report widgets) are left to a manual check.
export class DataSetInspector implements DocumentInspector<DataSets.DataSet> {
  private readonly context: RenameContext;
  private readonly naming: NamingPolicy;

  constructor(context: RenameContext, naming: NamingPolicy) {
    this.context = context;
    this.naming = naming;
  }

  usesEntity(dataSet: DataSets.DataSet, _info?: Readonly<Primitives.UnitInfo>): boolean {
    const source = dataSet.source;
    const found =
      dataSet.parameters.some((parameter) => this.isEntityParameter(parameter)) ||
      (source.$Type === "DataSets$JavaDataSetSource" && source.columns.some((column) => this.isEntity(entityOfDataType(column.columnType)))) ||
      (source.$Type === "DataSets$OqlDataSetSource" && source.query !== null && this.queryUsesEntity(source.query));
    console.debug(`dataset ${dataSet.name}: uses entity=${found}`);
    return found;
  }

  planLocalRenames(dataSet: DataSets.DataSet): LocalRenames {
    return planNamedRenames(
      `dataset ${dataSet.name}`,
      dataSet.parameters,
      (parameter) => this.isEntityParameter(parameter),
      this.naming,
      false,
    );
  }

  // UNVERIFIED: the query and constraints use parameters as `$Name`, and parameter access lists hold the bare name.
  apply(dataSet: DataSets.DataSet, local: LocalRenames): number {
    let changes = applyNamedRenames(dataSet.parameters, local);
    if (local.renames.size === 0) {
      return changes;
    }
    const rewrite = (owner: Record<string, unknown>, property: string, bare: boolean): void => {
      const value = owner[property];
      if (typeof value !== "string") {
        return;
      }
      const newValue = bare ? rewriteName(value, local.renames) : rewriteExpression(value, local.renames);
      if (newValue !== value) {
        owner[property] = newValue;
        changes++;
      }
    };
    walkElements(dataSet, (element) => {
      switch (element.$Type) {
        case "DataSets$DataSetParameterAccess":
          rewrite(element, "parameterName", true);
          break;
        case "DataSets$OqlDataSetSource":
          rewrite(element, "query", false);
          break;
        case "DataSets$DataSetObjectConstraint":
          rewrite(element, "constraint", false);
          break;
        case "DataSets$DataSetConstraintAccess":
          rewrite(element, "constraintText", false);
          break;
      }
    });
    console.debug(`dataset ${dataSet.name}: ${changes} changes`);
    return changes;
  }

  private queryUsesEntity(query: string): boolean {
    return (
      referencesQualifiedName(query, this.context.oldQualifiedName) || referencesQualifiedName(query, this.context.newQualifiedName)
    );
  }

  private isEntityParameter(parameter: DataSets.DataSetParameter): boolean {
    return this.isEntity(entityOfDataType(parameter.parameterType));
  }

  private isEntity(qname: string | null | undefined): boolean {
    return isEntityQname(qname, this.context);
  }
}
