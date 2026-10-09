import type { Status } from "../shared/design/status";
import { allEntityNames, type EntityOption } from "./entityPicker";
import type { RenameRequest, RenameRunResult, RenameServiceDeps } from "./renameService";
import { buildRunLog, runLogMeta, type RunLog } from "./ui/runLog";
import { type PaneField, validateRequest } from "./validation";

// What the pane controller needs from the DOM; PaneView implements it, tests fake it.
export interface PaneViewPort {
  setModules(names: readonly string[], selected?: string): void;
  // null: no module selected, the entity picker is disabled.
  setEntities(options: readonly EntityOption[] | null, selectedId?: string): void;
  readRequest(): { moduleName: string; entityId: string; newName: string };
  showFieldError(field: PaneField, message: string): void;
  clearFieldErrors(): void;
  showOutcome(status: Status): void;
  clearOutcome(): void;
  // null hides the run log.
  showRunLog(log: RunLog | null, meta: string): void;
  setBusy(busy: boolean): void;
  clearNameInput(): void;
}

export type PaneData = {
  readonly excludedModules: ReadonlySet<string>;
  // Module name -> entities, both sorted.
  readonly byModule: ReadonlyMap<string, readonly EntityOption[]>;
};

export type RenameScope = Pick<RenameServiceDeps, "excludedModules" | "allEntityNames" | "entityNamesInModule">;

export type PaneDeps = {
  loadData(): Promise<PaneData>;
  rename(request: RenameRequest, scope: RenameScope): Promise<RenameRunResult>;
  now?(): Date;
};

// The Entity Name Changer pane without the DOM: loading, picking, validating, renaming, reporting.
export class EntityNameChangerPane {
  private readonly view: PaneViewPort;
  private readonly deps: PaneDeps;
  private data: PaneData = { excludedModules: new Set(), byModule: new Map() };
  private moduleName = "";
  private busy = false;

  constructor(view: PaneViewPort, deps: PaneDeps) {
    this.view = view;
    this.deps = deps;
  }

  async load(): Promise<void> {
    console.info("pane: loading modules and entities");
    try {
      this.data = await this.deps.loadData();
    } catch (error: unknown) {
      console.info(`pane: loading failed: ${error}`);
      this.view.showOutcome({ tone: "error", text: `Could not load entities: ${errorMessage(error)}` });
      return;
    }
    this.moduleName = "";
    this.view.setModules([...this.data.byModule.keys()]);
    this.view.setEntities(null);
    console.info(`pane: ${this.data.byModule.size} modules loaded`);
  }

  selectModule(moduleName: string): void {
    console.debug(`pane: module '${moduleName}' selected`);
    this.moduleName = moduleName;
    this.view.clearFieldErrors();
    this.view.setEntities(moduleName === "" ? null : (this.data.byModule.get(moduleName) ?? []));
  }

  async submit(): Promise<void> {
    if (this.busy) {
      console.debug("pane: submit ignored, a rename is running");
      return;
    }
    this.view.clearFieldErrors();
    this.view.clearOutcome();
    const input = this.view.readRequest();
    const options = this.data.byModule.get(input.moduleName) ?? [];
    const entity = options.find((o) => o.id === input.entityId);
    const problem = validateRequest({ moduleName: input.moduleName, entity, newName: input.newName });
    if (problem !== null || entity === undefined) {
      console.info(`pane: request invalid: ${problem?.message}`);
      if (problem !== null) {
        this.view.showFieldError(problem.field, problem.message);
      }
      return;
    }
    await this.run({ entity, newName: input.newName }, options);
  }

  clearLog(): void {
    console.debug("pane: run log cleared");
    this.view.clearOutcome();
    this.view.showRunLog(null, "");
  }

  private async run(request: RenameRequest, moduleOptions: readonly EntityOption[]): Promise<void> {
    const { entity, newName } = request;
    this.setBusy(true);
    this.view.showOutcome({ tone: "info", text: `Renaming ${entity.moduleName}.${entity.name} to ${entity.moduleName}.${newName}…` });
    const started = this.now();
    try {
      const result = await this.deps.rename(request, {
        excludedModules: this.data.excludedModules,
        allEntityNames: allEntityNames(this.data.byModule),
        entityNamesInModule: moduleOptions.map((o) => o.name),
      });
      this.view.clearOutcome();
      if (result.kind === "rejected") {
        this.view.showFieldError("name", result.message);
        return;
      }
      for (const line of result.report.summary()) {
        console.info(`pane: ${line}`);
      }
      const log = buildRunLog(result.dialog, result.report, result.context);
      this.view.showOutcome(log.outcome);
      this.view.showRunLog(log, runLogMeta(started, this.now()));
      if (result.report.entityRenamed) {
        this.view.clearNameInput();
        await this.reload(entity.id);
      }
    } catch (error: unknown) {
      console.info(`pane: rename failed: ${error}`);
      this.view.clearOutcome();
      this.view.showOutcome({ tone: "error", text: `Rename failed: ${errorMessage(error)}` });
    } finally {
      this.setBusy(false);
    }
  }

  // After a rename: fresh names, same module, the renamed entity still selected.
  private async reload(entityId: string): Promise<void> {
    try {
      this.data = await this.deps.loadData();
    } catch (error: unknown) {
      console.info(`pane: reload failed: ${error}`);
      this.view.showOutcome({ tone: "error", text: `Could not reload entities: ${errorMessage(error)}` });
      return;
    }
    const moduleName = this.moduleName;
    this.view.setModules([...this.data.byModule.keys()], moduleName);
    const options = this.data.byModule.get(moduleName);
    this.view.setEntities(options ?? null, entityId);
    console.info(`pane: entities reloaded, ${options?.length ?? 0} in ${moduleName}`);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.view.setBusy(busy);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
