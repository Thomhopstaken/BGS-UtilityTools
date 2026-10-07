import type { Primitives, ProgressDialogResult, ProgressDialogStep } from "@mendix/extensions-api";
import { createRenameContext, type RenameContext, type RenameContextInput } from "../../../EntityNameChanger/framework/RenameContext";
import { UNCHANGED, type UnitAccess, type UnitUpdater, type UnitUpdateResult } from "../../../EntityNameChanger/framework/types";

// Test-only fakes for the Studio Pro model APIs; plain objects cast to the Mendix types.

export function fakeContext(overrides: Partial<RenameContextInput> = {}): RenameContext {
  return createRenameContext({
    entityId: "entity-1",
    domainModelId: "dm-1",
    moduleName: "MyModule",
    oldName: "Order",
    newName: "Purchase",
    excludedModules: new Set(["System"]),
    allEntityNames: ["Order", "Customer"],
    ...overrides,
  });
}

export function fakeUnitInfo(
  id: string,
  type: string,
  moduleName: string | undefined = "MyModule",
  name: string | undefined = id,
): Readonly<Primitives.UnitInfo> {
  return { $ID: id, $Type: type, moduleName, name } as unknown as Primitives.UnitInfo;
}

export function fakeUnit<TUnit extends Primitives.UnitBase = Primitives.UnitBase>(
  id: string,
  props: Record<string, unknown> = {},
): TUnit {
  return { $ID: id, ...props } as unknown as TUnit;
}

export type FakeUnitAccess<TUnit extends Primitives.UnitBase> = UnitAccess<TUnit> & {
  loadCalls: { maxUnitsToLoad: number | undefined }[];
  saved: Primitives.ElementBase[];
  getUnitsInfoCalls: number;
  loadError: unknown;
};

// Serves units whose info passes the filter, like app.model.*.loadAll.
export function fakeUnitAccess<TUnit extends Primitives.UnitBase>(
  units: TUnit[],
  infos: Readonly<Primitives.UnitInfo>[] = [],
): FakeUnitAccess<TUnit> {
  const access: FakeUnitAccess<TUnit> = {
    loadCalls: [],
    saved: [],
    getUnitsInfoCalls: 0,
    loadError: undefined,
    async getUnitsInfo() {
      access.getUnitsInfoCalls++;
      return infos;
    },
    async loadAll(filter, maxUnitsToLoad) {
      access.loadCalls.push({ maxUnitsToLoad });
      if (access.loadError !== undefined) {
        throw access.loadError;
      }
      return units.filter((unit) => filter({ $ID: unit.$ID } as Primitives.UnitInfo));
    },
    async save(element) {
      access.saved.push(element);
    },
  };
  return access;
}

export type FakeResolveAccess = {
  resolve<TElement extends Primitives.ElementBase>(type: TElement["$Type"], qualifiedName: string): Promise<TElement | null>;
  calls: { type: string; qualifiedName: string }[];
};

// Resolves from a map keyed "<type>:<qualified name>"; an Error value is thrown.
export function fakeResolveAccess(elements: Record<string, unknown> = {}): FakeResolveAccess {
  const access: FakeResolveAccess = {
    calls: [],
    async resolve<TElement extends Primitives.ElementBase>(type: TElement["$Type"], qualifiedName: string) {
      access.calls.push({ type, qualifiedName });
      const element = elements[`${type}:${qualifiedName}`];
      if (element instanceof Error) {
        throw element;
      }
      return (element ?? null) as TElement | null;
    },
  };
  return access;
}

// Runs every step in order like the progress dialog; stops at the first step that returns a message.
export function fakeProgressRunner(override?: ProgressDialogResult) {
  const runner = {
    titles: [] as string[],
    steps: [] as ProgressDialogStep[],
    async run(title: string, steps: ProgressDialogStep[]): Promise<ProgressDialogResult> {
      runner.titles.push(title);
      runner.steps = steps;
      if (override !== undefined) {
        return override;
      }
      for (const step of steps) {
        const outcome = await step.action();
        if (outcome !== true) {
          return { result: "Failure", failedStep: { stepTitle: step.title, error: String(outcome) } } as ProgressDialogResult;
        }
      }
      return { result: "Success" } as ProgressDialogResult;
    },
  };
  return runner;
}

export function fakeUpdater(
  access: UnitAccess<Primitives.UnitBase>,
  update: (unit: Primitives.UnitBase, info: Readonly<Primitives.UnitInfo>) => Promise<UnitUpdateResult> = async () => ({
    ...UNCHANGED,
  }),
  props: Partial<Pick<UnitUpdater, "label" | "unitType" | "implemented" | "description">> = {},
): UnitUpdater {
  return {
    label: "Microflows",
    unitType: "Microflows$Microflow",
    implemented: true,
    description: "Testing",
    access,
    update,
    ...props,
  };
}

export function changed(overrides: Partial<UnitUpdateResult> = {}): UnitUpdateResult {
  return { changed: true, renamedTo: null, renamedVariables: 1, skippedRenames: 0, ...overrides };
}
