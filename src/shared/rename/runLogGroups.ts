import type { RunLogGroup, RunLogRow } from "../design/runLog";
import { apiMs, describeCalls, type JobTimings, seconds } from "./JobTimings";
import type { JobReport, UnitOutcome } from "./JobReport";

// Run log groups every rename tool shows, built from the job report.

export function failedGroup(report: JobReport): RunLogGroup {
  return {
    title: "Failed documents",
    rows: report.failures.map((f) => ({ tone: "error", what: f.name, note: `${f.label}: ${f.error}`, target: { documentId: f.unitId } })),
  };
}

// One warning per document left as it was on purpose, with the reason.
export function skippedDocumentsGroup(report: JobReport): RunLogGroup {
  return {
    title: "Skipped documents",
    rows: report.skippedDocuments.map((d) => ({
      tone: "warning",
      what: d.newQualifiedName === null ? d.qualifiedName : `${d.qualifiedName} → ${d.newQualifiedName}`,
      note: `${unitTypeName(d.unitType)}: ${d.reason}`,
      target: { documentId: d.unitId },
    })),
  };
}

export function renamedGroup(report: JobReport): RunLogGroup {
  return {
    title: "Renamed documents",
    rows: report.renamedDocuments.map((d) => ({
      tone: "success",
      what: `${d.oldQualifiedName} → ${d.newQualifiedName}`,
      note: unitTypeName(d.unitType),
      target: { documentId: d.unitId },
    })),
  };
}

// One row per changed unit; a unit visited by several passes is merged.
export function updatedGroup(report: JobReport): RunLogGroup {
  const byUnit = new Map<string, { qualifiedName: string } & Counts>();
  for (const outcome of report.changed) {
    const entry = byUnit.get(outcome.unitId) ?? {
      qualifiedName: outcome.qualifiedName,
      variables: 0,
      references: 0,
      associations: 0,
      exposedNames: 0,
    };
    addCounts(entry, outcome);
    byUnit.set(outcome.unitId, entry);
  }
  const rows: RunLogRow[] = [];
  for (const [unitId, entry] of byUnit) {
    const note = changeNote(entry.variables, entry.references, entry.associations, entry.exposedNames);
    if (note !== null) {
      rows.push({ tone: "success", what: entry.qualifiedName, note, target: { documentId: unitId } });
    }
  }
  return { title: "Updated documents", rows };
}

type Counts = { variables: number; references: number; associations: number; exposedNames: number };

function addCounts(entry: Counts, outcome: UnitOutcome): void {
  entry.variables += outcome.result.renamedVariables;
  entry.references += outcome.result.updatedReferences;
  entry.associations += outcome.result.renamedAssociations;
  entry.exposedNames += outcome.result.renamedExposedNames ?? 0;
}

// "2 variables, 4 references, 1 association, 3 exposed names"; null when nothing was counted (e.g. a refresh save).
export function changeNote(variables: number, references: number, associations: number, exposedNames = 0): string | null {
  const parts = [
    plural(variables, "variable"),
    plural(references, "reference"),
    plural(associations, "association"),
    plural(exposedNames, "exposed name"),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(", ");
}

// "1 rename", "3 renames"; null for 0.
export function plural(n: number, word: string): string | null {
  if (n === 0) {
    return null;
  }
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Where the time went: the dialog total, the model API over all steps, then each step, slowest first.
// "other" is time outside model API calls: this extension's code, and Studio Pro work between calls.
export function timingsGroup(timings: JobTimings): RunLogGroup {
  if (timings.steps.length === 0) {
    return { title: "Timings", rows: [] };
  }
  const stepsMs = timings.stepsMs;
  const totalMs = timings.dialogMs ?? stepsMs;
  const totals = timings.totals();
  const rows: RunLogRow[] = [
    {
      tone: "info",
      what: `Total ${seconds(totalMs)}`,
      note: `${timings.steps.length} steps ${seconds(stepsMs)}, between steps ${seconds(totalMs - stepsMs)}`,
    },
    { tone: "info", what: `Model API ${seconds(apiMs(totals))}`, note: describeCalls(totals) || "no calls" },
  ];
  if (timings.outside.calls.size > 0) {
    rows.push({ tone: "info", what: `${timings.outside.title} ${seconds(apiMs(timings.outside.calls))}`, note: describeCalls(timings.outside.calls) });
  }
  for (const step of [...timings.steps].sort((a, b) => b.ms - a.ms)) {
    const other = `other ${seconds(step.ms - apiMs(step.calls))}`;
    const calls = describeCalls(step.calls);
    rows.push({ tone: "info", what: `${step.title} ${seconds(step.ms)}`, note: calls === "" ? other : `${calls}, ${other}` });
  }
  console.debug(`timings: ${rows.length} rows`);
  return { title: "Timings", rows };
}

// "Microflows$Microflow" -> "Microflow".
export function unitTypeName(unitType: string): string {
  const name = unitType.split("$").pop() ?? unitType;
  return name.length === 0 ? unitType : name;
}
