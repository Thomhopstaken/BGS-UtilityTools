import type { Status } from "./status";

// The RunLog component's data: an outcome line and grouped rows.

// info: not a result (timings); never counted or opened by default.
export type RowTone = "success" | "warning" | "error" | "info";
export type CountedTone = Exclude<RowTone, "info">;

// The document a row is about; elementId focuses an element inside it.
export type RowTarget = {
  readonly documentId: string;
  readonly elementId?: string;
};

export type RunLogRow = {
  readonly tone: RowTone;
  readonly what: string;
  readonly note?: string;
  // Rows about one document open it when clicked.
  readonly target?: RowTarget;
};

export type RunLogGroup = {
  readonly title: string;
  readonly rows: readonly RunLogRow[];
};

export type RunLog = {
  readonly outcome: Status;
  readonly groups: readonly RunLogGroup[];
};

export type RunLogCounts = Readonly<Record<CountedTone, number>>;

// Rows per tone; info rows are not counted.
export function countRows(log: RunLog): RunLogCounts {
  const counts = { success: 0, warning: 0, error: 0 };
  for (const group of log.groups) {
    for (const row of group.rows) {
      if (row.tone !== "info") {
        counts[row.tone]++;
      }
    }
  }
  return counts;
}

const isProblem = (row: RunLogRow) => row.tone === "warning" || row.tone === "error";

// Groups with warning and error rows only; empty groups are dropped.
export function onlyProblems(groups: readonly RunLogGroup[]): RunLogGroup[] {
  return groups
    .map((group) => ({ title: group.title, rows: group.rows.filter(isProblem) }))
    .filter((group) => group.rows.length > 0);
}

// Problems open first; other groups stay folded.
export function isOpenByDefault(group: RunLogGroup): boolean {
  return group.rows.some(isProblem);
}

export function countLabel(tone: CountedTone, n: number): string {
  switch (tone) {
    case "success":
      return `${n} updated`;
    case "warning":
      return `${n} ${n === 1 ? "warning" : "warnings"}`;
    case "error":
      return `${n} failed`;
  }
}

// "14:02:11 · 3.4 s" for the run log header.
export function runLogMeta(startedAt: Date, endedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(endedAt.getHours())}:${pad(endedAt.getMinutes())}:${pad(endedAt.getSeconds())}`;
  const seconds = Math.max(0, endedAt.getTime() - startedAt.getTime()) / 1000;
  return `${time} · ${seconds.toFixed(1)} s`;
}
