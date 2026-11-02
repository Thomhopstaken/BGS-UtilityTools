import type { ProgressDialogResult } from "@mendix/extensions-api";
import type { RunLog, RunLogGroup, RunLogRow } from "../../shared/design/runLog";
import type { Status } from "../../shared/design/status";
import { failedGroup, plural, renamedGroup, timingsGroup, updatedGroup } from "../../shared/rename/runLogGroups";
import type { RenameContext } from "../framework/RenameContext";
import type { RenameReport } from "../framework/RenameReport";

// What one entity rename did, shaped for the pane: an outcome line and grouped rows.

// Groups in display order; empty groups are dropped.
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
    timingsGroup(report.timings),
  ].filter((group): group is RunLogGroup => group !== null && group.rows.length > 0);
  const outcome = buildOutcome(dialog, report, context);
  console.info(`run log: ${outcome.tone} '${outcome.text}', groups [${groups.map((g) => `${g.title} ${g.rows.length}`).join(", ")}]`);
  return { outcome, groups };
}

// The pane's one-line outcome for the dialog result.
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
