// Where a rename spends its time: every model API call, per progress step. Shown in the run log.

export type ApiCallStats = {
  calls: number;
  ms: number;
  // Units returned as a list (loadAll, getUnitsInfo); 0 for other calls.
  units: number;
};

export type StepTiming = {
  readonly title: string;
  ms: number;
  // Per API method, e.g. loadAll, save, resolve.
  readonly calls: Map<string, ApiCallStats>;
};

// Milliseconds; injectable so tests control time.
export type Clock = () => number;

// Timings of one job, filled by measureStep, measureDialog and the instrumented model.
export class JobTimings {
  readonly steps: StepTiming[] = [];
  // Calls made while no step runs, e.g. before the dialog opens.
  readonly outside: StepTiming = { title: "Outside the steps", ms: 0, calls: new Map() };
  // The progress dialog from open to close; null until it closed.
  dialogMs: number | null = null;
  private current: StepTiming | null = null;

  constructor(readonly clock: Clock = () => performance.now()) {}

  // Calls made while action runs are recorded on this step.
  async measureStep<T>(title: string, action: () => Promise<T>): Promise<T> {
    const step: StepTiming = { title, ms: 0, calls: new Map() };
    this.steps.push(step);
    this.current = step;
    const started = this.clock();
    try {
      return await action();
    } finally {
      step.ms = this.clock() - started;
      this.current = null;
      console.info(`step '${title}' took ${Math.round(step.ms)} ms: ${describeCalls(step.calls) || "no API calls"}`);
    }
  }

  async measureDialog<T>(action: () => Promise<T>): Promise<T> {
    const started = this.clock();
    try {
      return await action();
    } finally {
      this.dialogMs = this.clock() - started;
      console.info(`progress dialog took ${Math.round(this.dialogMs)} ms, steps ${Math.round(this.stepsMs)} ms`);
    }
  }

  // On the running step, or on outside when no step runs.
  recordCall(method: string, ms: number, units: number): void {
    const step = this.current ?? this.outside;
    const stats = step.calls.get(method) ?? { calls: 0, ms: 0, units: 0 };
    stats.calls++;
    stats.ms += ms;
    stats.units += units;
    step.calls.set(method, stats);
    console.debug(`${method} took ${Math.round(ms)} ms${units > 0 ? ` for ${units} units` : ""} in '${step.title}'`);
  }

  get stepsMs(): number {
    return this.steps.reduce((sum, step) => sum + step.ms, 0);
  }

  // Every method over all steps, the calls outside them included.
  totals(): Map<string, ApiCallStats> {
    const totals = new Map<string, ApiCallStats>();
    for (const step of [...this.steps, this.outside]) {
      for (const [method, stats] of step.calls) {
        const total = totals.get(method) ?? { calls: 0, ms: 0, units: 0 };
        total.calls += stats.calls;
        total.ms += stats.ms;
        total.units += stats.units;
        totals.set(method, total);
      }
    }
    return totals;
  }
}

// Total time of all calls.
export function apiMs(calls: ReadonlyMap<string, ApiCallStats>): number {
  let ms = 0;
  for (const stats of calls.values()) {
    ms += stats.ms;
  }
  return ms;
}

// "1.2 s"
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

// "loadAll 3× 120 units 2.1 s, save 4× 0.8 s"; slowest first, "" without calls.
export function describeCalls(calls: ReadonlyMap<string, ApiCallStats>): string {
  return [...calls]
    .sort(([, a], [, b]) => b.ms - a.ms)
    .map(([method, stats]) => `${method} ${stats.calls}×${stats.units > 0 ? ` ${stats.units} units` : ""} ${seconds(stats.ms)}`)
    .join(", ");
}

// Wraps every method of every model API (app.model.microflows.loadAll, ...) so each call is timed.
// The proxies wrap empty objects, so a frozen or non-configurable API property can't break them.
// UNVERIFIED: model API methods work when called with their API object as this.
export function instrumentModel<T extends object>(model: T, timings: JobTimings): T {
  const apis = new Map<PropertyKey, unknown>();
  return new Proxy({} as T, {
    get(_, prop) {
      const value: unknown = Reflect.get(model, prop);
      if (typeof value !== "object" || value === null) {
        return value;
      }
      if (!apis.has(prop)) {
        apis.set(prop, instrumentApi(value, timings));
      }
      return apis.get(prop);
    },
  });
}

// Wraps one model API; each method is wrapped once and reused.
function instrumentApi(api: object, timings: JobTimings): object {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy({}, {
    get(_, prop) {
      const value: unknown = Reflect.get(api, prop);
      if (typeof value !== "function") {
        return value;
      }
      if (!methods.has(prop)) {
        methods.set(prop, timed(value as (...args: unknown[]) => unknown, api, String(prop), timings));
      }
      return methods.get(prop);
    },
  });
}

// Records the call when it returns, or when its promise settles; failed calls are recorded too.
function timed(fn: (...args: unknown[]) => unknown, api: object, method: string, timings: JobTimings): (...args: unknown[]) => unknown {
  return (...args) => {
    const started = timings.clock();
    const done = (result: unknown) => timings.recordCall(method, timings.clock() - started, Array.isArray(result) ? result.length : 0);
    const result = fn.apply(api, args);
    if (typeof (result as PromiseLike<unknown> | null)?.then !== "function") {
      done(result);
      return result;
    }
    return Promise.resolve(result).then(
      (value) => {
        done(value);
        return value;
      },
      (error: unknown) => {
        done(undefined);
        throw error;
      },
    );
  };
}
