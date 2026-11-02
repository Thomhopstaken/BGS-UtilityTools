import { describe, expect, it } from "vitest";
import { apiMs, describeCalls, instrumentModel, JobTimings, seconds } from "../../../EntityNameChanger/framework/JobTimings";

// A clock that moves only when told to.
function manualClock() {
  const clock = { now: 0, read: () => clock.now };
  return clock;
}

function fakeModel(clock: { now: number }) {
  return {
    microflows: {
      name: "microflows",
      async loadAll() {
        clock.now += 300;
        return [{ $ID: "a" }, { $ID: "b" }];
      },
      async save() {
        clock.now += 50;
      },
      async failing() {
        clock.now += 10;
        throw new Error("boom");
      },
      sync() {
        return this.name;
      },
    },
    version: "11.12",
  };
}

describe("JobTimings.measureStep", () => {
  it("times a step and books calls on it", async () => {
    const clock = manualClock();
    const timings = new JobTimings(clock.read);
    const result = await timings.measureStep("Planning", async () => {
      timings.recordCall("loadAll", 200, 25);
      clock.now += 500;
      return true;
    });
    expect(result).toBe(true);
    expect(timings.steps).toEqual([{ title: "Planning", ms: 500, calls: new Map([["loadAll", { calls: 1, ms: 200, units: 25 }]]) }]);
    expect(timings.outside.calls.size).toBe(0);
  });

  it("times a failing step and passes the error on", async () => {
    const clock = manualClock();
    const timings = new JobTimings(clock.read);
    await expect(
      timings.measureStep("Broken", async () => {
        clock.now += 40;
        throw new Error("bad");
      }),
    ).rejects.toThrow("bad");
    expect(timings.steps[0].ms).toBe(40);
  });

  it("books calls outside a step separately", async () => {
    const timings = new JobTimings(manualClock().read);
    timings.recordCall("getModulesTree", 30, 0);
    await timings.measureStep("Step", async () => true);
    timings.recordCall("getModulesTree", 20, 0);
    expect(timings.outside.calls.get("getModulesTree")).toEqual({ calls: 2, ms: 50, units: 0 });
    expect(timings.steps[0].calls.size).toBe(0);
  });
});

describe("JobTimings totals", () => {
  it("sums steps and calls per method, outside calls included", async () => {
    const clock = manualClock();
    const timings = new JobTimings(clock.read);
    timings.recordCall("save", 5, 0);
    await timings.measureStep("A", async () => {
      timings.recordCall("loadAll", 100, 10);
      timings.recordCall("save", 20, 0);
      clock.now += 200;
    });
    await timings.measureStep("B", async () => {
      timings.recordCall("loadAll", 50, 5);
      clock.now += 100;
    });
    expect(timings.stepsMs).toBe(300);
    expect(timings.totals()).toEqual(
      new Map([
        ["save", { calls: 2, ms: 25, units: 0 }],
        ["loadAll", { calls: 2, ms: 150, units: 15 }],
      ]),
    );
  });

  it("times the dialog, also when it fails", async () => {
    const clock = manualClock();
    const timings = new JobTimings(clock.read);
    expect(timings.dialogMs).toBeNull();
    await timings.measureDialog(async () => {
      clock.now += 900;
    });
    expect(timings.dialogMs).toBe(900);
    await expect(timings.measureDialog(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(timings.dialogMs).toBe(0);
  });
});

describe("formatting", () => {
  it("shows seconds with one decimal, never negative", () => {
    expect(seconds(1234)).toBe("1.2 s");
    expect(seconds(0)).toBe("0.0 s");
    expect(seconds(-5)).toBe("0.0 s");
  });

  it("describes calls slowest first, with units only for lists", () => {
    const calls = new Map([
      ["save", { calls: 4, ms: 800, units: 0 }],
      ["loadAll", { calls: 3, ms: 2100, units: 120 }],
    ]);
    expect(describeCalls(calls)).toBe("loadAll 3× 120 units 2.1 s, save 4× 0.8 s");
    expect(describeCalls(new Map())).toBe("");
    expect(apiMs(calls)).toBe(2900);
  });
});

describe("instrumentModel", () => {
  it("times async calls per method and counts returned units", async () => {
    const clock = manualClock();
    const timings = new JobTimings(clock.read);
    const model = instrumentModel(fakeModel(clock), timings);
    await timings.measureStep("Step", async () => {
      expect(await model.microflows.loadAll()).toEqual([{ $ID: "a" }, { $ID: "b" }]);
      await model.microflows.save();
      await model.microflows.save();
    });
    expect(timings.steps[0].calls).toEqual(
      new Map([
        ["loadAll", { calls: 1, ms: 300, units: 2 }],
        ["save", { calls: 2, ms: 100, units: 0 }],
      ]),
    );
  });

  it("times a rejected call and passes the error on", async () => {
    const clock = manualClock();
    const timings = new JobTimings(clock.read);
    const model = instrumentModel(fakeModel(clock), timings);
    await expect(model.microflows.failing()).rejects.toThrow("boom");
    expect(timings.outside.calls.get("failing")).toEqual({ calls: 1, ms: 10, units: 0 });
  });

  it("calls methods on the real API object and passes plain values through", () => {
    const timings = new JobTimings(manualClock().read);
    const model = instrumentModel(fakeModel(manualClock()), timings);
    expect(model.microflows.sync()).toBe("microflows");
    expect(model.microflows.name).toBe("microflows");
    expect(model.version).toBe("11.12");
    expect(timings.outside.calls.get("sync")?.calls).toBe(1);
  });

  it("returns the same wrapper on every access", () => {
    const model = instrumentModel(fakeModel(manualClock()), new JobTimings());
    expect(model.microflows).toBe(model.microflows);
    expect(model.microflows.save).toBe(model.microflows.save);
  });

  it("works on frozen APIs", async () => {
    const clock = manualClock();
    const timings = new JobTimings(clock.read);
    const raw = fakeModel(clock);
    Object.freeze(raw.microflows);
    const model = instrumentModel(Object.freeze(raw), timings);
    await model.microflows.save();
    expect(timings.outside.calls.get("save")?.calls).toBe(1);
  });
});
