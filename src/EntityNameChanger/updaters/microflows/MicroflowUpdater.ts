import type { Microflows, Primitives } from "@mendix/extensions-api";
import type { DocumentNameRegistry } from "../../framework/DocumentNameRegistry";
import type { UnitAccess, UnitUpdater, UnitUpdateResult } from "../../framework/types";
import type { MicroflowHelper } from "./MicroflowHelper";
import type { ReferenceResolver } from "./ReferenceResolver";

// Renames entity variables, parameters, the return variable name and the microflow itself.
export class MicroflowUpdater implements UnitUpdater<Microflows.Microflow> {
  readonly label = "Microflows";
  readonly unitType = "Microflows$Microflow";
  readonly implemented = true;
  readonly description = "Renaming variables, parameters and microflows";
  readonly access: UnitAccess<Microflows.Microflow>;
  private readonly helper: MicroflowHelper;
  private readonly resolver: ReferenceResolver;
  private readonly documentNames: DocumentNameRegistry;

  constructor(
    access: UnitAccess<Microflows.Microflow>,
    helper: MicroflowHelper,
    resolver: ReferenceResolver,
    documentNames: DocumentNameRegistry,
  ) {
    this.access = access;
    this.helper = helper;
    this.resolver = resolver;
    this.documentNames = documentNames;
  }

  async update(flow: Microflows.Microflow, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult> {
    const helper = this.helper;
    console.log(`checking ${info.moduleName}.${flow.name}`);
    helper.reset();
    await this.resolver.resolveAll(helper.collectReferences(flow.objectCollection.objects));
    helper.detectEntityVariables(flow);

    if (helper.renames.length > 0) {
      helper.applyRenames();
      helper.updateObjectUsages(flow.objectCollection.objects);
    } else {
      console.debug(`no variables to rename in ${flow.name}`);
    }
    const returnVariableChanged = helper.updateReturnVariableName(flow);
    const document = this.renameDocument(flow, info);

    const result: UnitUpdateResult = {
      changed: helper.renames.length > 0 || returnVariableChanged || document.renamedTo !== null,
      renamedTo: document.renamedTo,
      renamedVariables: helper.renames.length,
      skippedRenames: helper.skippedRenames + document.skipped,
    };
    console.info(
      `${info.moduleName}.${flow.name}: changed=${result.changed}, ${result.renamedVariables} renames, ${result.skippedRenames} skipped`,
    );
    return result;
  }

  // Renames the microflow when its name contains the entity name and it uses the entity.
  private renameDocument(
    flow: Microflows.Microflow,
    info: Readonly<Primitives.UnitInfo>,
  ): { renamedTo: string | null; skipped: number } {
    if (!this.helper.shouldRenameDocument(flow)) {
      return { renamedTo: null, skipped: 0 };
    }
    const newName = this.helper.naming.rename(flow.name);
    const moduleName = info.moduleName;
    if (newName === flow.name || moduleName === undefined) {
      return { renamedTo: null, skipped: 0 };
    }
    if (!this.documentNames.isFree(moduleName, newName)) {
      console.info(`skipped renaming microflow ${moduleName}.${flow.name}: ${newName} already exists`);
      return { renamedTo: null, skipped: 1 };
    }
    console.info(`renaming microflow ${moduleName}.${flow.name} to ${newName}`);
    this.documentNames.register(moduleName, flow.name, newName);
    flow.name = newName;
    return { renamedTo: newName, skipped: 0 };
  }
}
