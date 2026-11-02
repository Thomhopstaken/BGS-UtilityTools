import type { ProgressDialogResult } from "@mendix/extensions-api";
import type { RenameContext } from "../framework/RenameContext";
import type { RenameReport, UnitOutcome } from "../framework/RenameReport";
import type { Status } from "../../shared/design/status";

// What one rename did, shaped for the pane: an outcome line and grouped rows.

export type RowTone = "success" | "warning" | "error";

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

export type RunLogCounts = Readonly<Record<RowTone, number>>;

export function buildRunLog(dialog: ProgressDialogResult, report: RenameReport, context: RenameContext): RunLog {
  const groups = [
    entityGroup(report, context),
    failedGroup(report),
    renamedGroup(report),
    updatedGroup(report),
    skippedGroup(report),
    navigationGroup(report),
    messageDefinitionGroup(report),
    codeAndReportsGroup(report),
  ].filter((group): group is RunLogGroup => group !== null && group.rows.length > 0);
  const outcome = buildOutcome(dialog, report, context);
  console.info(`run log: ${outcome.tone} '${outcome.text}', groups [${groups.map((g) => `${g.title} ${g.rows.length}`).join(", ")}]`);
  return { outcome, groups };
}

export function buildOutcome(dialog: ProgressDialogResult, report: RenameReport, context: RenameContext): Status {
  const from = context.oldQualifiedName;
  const failed = report.failures.length;
  const documents = failed === 1 ? "1 document" : `${failed} documents`;
  switch (dialog.result) {
    case "UserCancelled":
      return {
        tone: "warning",
        text: report.entityRenamed
          ? "Rename cancelled after the entity was renamed; documents updated so far are kept."
          : "Rename cancelled; nothing was changed.",
      };
    case "Failure":
      return { tone: "error", text: `Rename failed at '${dialog.failedStep?.stepTitle}': ${dialog.failedStep?.error}` };
    case "Success":
      if (!report.entityRenamed) {
        return failed > 0
          ? { tone: "error", text: `${documents} failed to update, so ${from} was not renamed. See the run log.` }
          : { tone: "warning", text: `${from} was not renamed: ${report.entitySkipReason ?? "unknown reason"}` };
      }
      return failed > 0
        ? { tone: "warning", text: `${from} renamed to ${context.newQualifiedName}, but ${documents} failed to update. See the run log.` }
        : { tone: "success", text: `${from} renamed to ${context.newQualifiedName}.` };
  }
}

function entityGroup(report: RenameReport, context: RenameContext): RunLogGroup {
  const what = `${context.oldQualifiedName} → ${context.newQualifiedName}`;
  // The entity in its domain model.
  const target = { documentId: context.domainModelId, elementId: context.entityId };
  if (report.entityRenamed) {
    const note = report.incompleteReason ?? undefined;
    return { title: "Entity", rows: [{ tone: note === undefined ? "success" : "warning", what, note, target }] };
  }
  const note = `Not renamed: ${report.entitySkipReason ?? "unknown reason"}`;
  return { title: "Entity", rows: [{ tone: report.hasErrors ? "error" : "warning", what, note, target }] };
}

function failedGroup(report: RenameReport): RunLogGroup {
  return {
    title: "Failed documents",
    rows: report.failures.map((f) => ({ tone: "error", what: f.name, note: `${f.label}: ${f.error}`, target: { documentId: f.unitId } })),
  };
}

function renamedGroup(report: RenameReport): RunLogGroup {
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
function updatedGroup(report: RenameReport): RunLogGroup {
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

function plural(n: number, word: string): string | null {
  if (n === 0) {
    return null;
  }
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function skippedGroup(report: RenameReport): RunLogGroup {
  const n = report.skippedRenames;
  return {
    title: "Skipped renames",
    rows:
      n === 0
        ? []
        : [{ tone: "warning", what: `${plural(n, "rename")} skipped`, note: "The new name is already in use; see the Studio Pro log." }],
  };
}

// One warning for all renamed documents navigation may reference; they are listed under Renamed documents.
function navigationGroup(report: RenameReport): RunLogGroup {
  const n = report.navigationDocuments().length;
  console.debug(`navigation: ${n} renamed documents to check`);
  return {
    title: "Navigation",
    rows:
      n === 0
        ? []
        : [
            {
              tone: "warning",
              what: "Check App > Navigation",
              note: `${n === 1 ? "1 renamed document" : `${n} renamed documents`} may be used by menu items, home pages or the login page; these are not updated.`,
            },
          ],
  };
}

// One warning per changed message definition that mappings use: Studio Pro makes those mappings follow the new
// schema, which clears them. The row opens the message definition.
function messageDefinitionGroup(report: RenameReport): RunLogGroup {
  return {
    title: "Message definitions",
    rows: report.changedMappedMessageDefinitions().map((definition) => ({
      tone: "warning",
      what: definition.qualifiedName,
      note: `Used by ${definition.mappings.join(", ")}. These mappings no longer match the changed schema; updating them in Studio Pro clears them, so they must be mapped again by hand.`,
      target: { documentId: definition.unitId },
    })),
  };
}

// Warnings for what is not updated: API clients, action code, report widgets and document templates.
function codeAndReportsGroup(report: RenameReport): RunLogGroup {
  const apis = report.changedApis().length;
  const actions = report.changedCodeActions().length;
  const dataSets = report.renamedDataSets().length;
  const templates = report.documentTemplates;
  console.debug(`code and reports: ${apis} APIs, ${actions} actions, ${dataSets} datasets, ${templates} document templates to check`);
  const rows: RunLogRow[] = [];
  if (apis > 0) {
    rows.push({
      tone: "warning",
      what: "Check API clients",
      note: `${apis === 1 ? "1 published service has" : `${apis} published services have`} renamed exposed names; their clients must be updated.`,
    });
  }
  if (actions > 0) {
    rows.push({
      tone: "warning",
      what: "Check javasource and javascriptsource",
      note: `${actions === 1 ? "1 changed Java or JavaScript action" : `${actions} changed Java or JavaScript actions`}; their code is not updated.`,
    });
  }
  if (dataSets > 0) {
    rows.push({
      tone: "warning",
      what: "Check report widgets",
      note: `${dataSets === 1 ? "1 renamed dataset" : `${dataSets} renamed datasets`} may be used by report widgets; these are not updated.`,
    });
  }
  // Only after a rename: before that, nothing they reference has changed.
  if (report.entityRenamed && templates !== 0) {
    rows.push({
      tone: "warning",
      what: "Check document templates",
      note:
        templates === null
          ? "Document templates could not be listed; they are deprecated and not updated."
          : `${templates === 1 ? "1 document template is" : `${templates} document templates are`} deprecated and not updated.`,
    });
  }
  return { title: "Code and reports", rows };
}

// "Microflows$Microflow" -> "Microflow".
export function unitTypeName(unitType: string): string {
  const name = unitType.split("$").pop() ?? unitType;
  return name.length === 0 ? unitType : name;
}

export function countRows(log: RunLog): RunLogCounts {
  const counts = { success: 0, warning: 0, error: 0 };
  for (const group of log.groups) {
    for (const row of group.rows) {
      counts[row.tone]++;
    }
  }
  return counts;
}

// Groups with warning and error rows only; empty groups are dropped.
export function onlyProblems(groups: readonly RunLogGroup[]): RunLogGroup[] {
  return groups
    .map((group) => ({ title: group.title, rows: group.rows.filter((row) => row.tone !== "success") }))
    .filter((group) => group.rows.length > 0);
}

// Problems open first; groups with only successes stay folded.
export function isOpenByDefault(group: RunLogGroup): boolean {
  return group.rows.some((row) => row.tone !== "success");
}

export function countLabel(tone: RowTone, n: number): string {
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
