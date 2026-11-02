import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import type { RenameReport } from "./RenameReport";

// Type-only imports from the Mendix package everywhere in the framework: its runtime needs Studio Pro.

// The model access an updater needs; app.model.* APIs match this structurally, tests can fake it.
export interface UnitAccess<TUnit extends Primitives.UnitBase> {
  getUnitsInfo(): Promise<ReadonlyArray<Readonly<Primitives.UnitInfo>>>;
  loadAll(filter: (info: Primitives.UnitInfo) => boolean, maxUnitsToLoad?: number): Promise<TUnit[]>;
  save<TElement extends Primitives.ElementBase>(element: TElement): Promise<void>;
}

// What one updater did to one unit; the report adds it up.
export type UnitUpdateResult = {
  // Whether the unit was modified and must be saved.
  changed: boolean;
  // New document name, null when the document kept its name.
  renamedTo: string | null;
  renamedVariables: number;
  // Entity references rewritten from the old to the new qualified name.
  updatedReferences: number;
  // Renames that were found but not applied, e.g. because the new name is taken.
  skippedRenames: number;
  renamedAssociations: number;
  // Exposed names (published services) changed; the published API changes with them.
  renamedExposedNames?: number;
};

// Result for a unit the updater left as it was.
export const UNCHANGED:Readonly<UnitUpdateResult> = Object.freeze({
  changed: false,
  renamedTo: null,
  renamedVariables: 0,
  updatedReferences: 0,
  skippedRenames: 0,
  renamedAssociations: 0,
});

// plan: read-only, decides renames; rename: applies them to the unit, which the job then saves.
export type UpdaterMode = "plan" | "rename";

// Updates one document type. update() only mutates the unit in memory; the job saves it.
export interface UnitUpdater<TUnit extends Primitives.UnitBase = Primitives.UnitBase> {
  readonly label: string;
  // Progress step title; defaults to "Updating <label>".
  readonly title?: string;
  readonly unitType: string;
  // Stubs are listed but never loaded.
  readonly implemented: boolean;
  readonly description: string;
  readonly access: UnitAccess<TUnit>;
  // Filters units when the step starts, so it can depend on earlier steps; all units when absent.
  accepts?(info: Readonly<Primitives.UnitInfo>, report: RenameReport): boolean;
  update(unit: TUnit, info: Readonly<Primitives.UnitInfo>): Promise<UnitUpdateResult>;
  // Planners that need only metadata: the job calls this instead of loading the unit. Never changes a unit.
  readonly updateFromInfo?: (info: Readonly<Primitives.UnitInfo>) => UnitUpdateResult;
}

// Wraps dialogs.showProgressDialog so the job can run without Studio Pro.
export type ProgressRunner = (title: string, steps: ProgressDialogStep[]) => Promise<ProgressDialogResult>;
