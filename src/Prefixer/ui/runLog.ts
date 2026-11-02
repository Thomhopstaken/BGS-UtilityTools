import type { ProgressDialogResult } from "@mendix/extensions-api";
import type { RunLog, RunLogGroup, RunLogRow } from "../../shared/design/runLog";
import type { Status } from "../../shared/design/status";
import type { JobReport } from "../../shared/rename/JobReport";
import { failedGroup, renamedGroup, skippedDocumentsGroup, timingsGroup, updatedGroup } from "../../shared/rename/runLogGroups";
import { type PrefixRisk, RENAMABLE_DOCUMENT_TYPES } from "../documentTypes";
import { describeChange, type PrefixChange } from "../prefixRename";

// What one prefix run did, shaped for the pane: an outcome line and grouped rows.

// The manual check per risk; n is the number of renamed documents with that risk.
const RISK_CHECKS: Readonly<Record<PrefixRisk, { what: string; note: (n: number) => string }>> = {
  navigation: {
    what: "Check App > Navigation",
    note: (n) => `${documents(n)} may be used by menu items, home pages or the login page; these are not updated.`,
  },
  settings: {
    what: "Check App > Settings",
    note: (n) =>
      `${n === 1 ? "1 renamed microflow" : `${n} renamed microflows`} may be the after startup, before shutdown or health check microflow, or be set in the workflow settings; these are not updated.`,
  },
  constantValues: {
    what: "Check constant values",
    note: (n) =>
      `${n === 1 ? "1 renamed constant" : `${n} renamed constants`}: values in App > Settings configurations and in Mendix Portal environments are stored by name; set them again.`,
  },
  actionCode: {
    what: "Check javasource and javascriptsource",
    note: (n) => `${n === 1 ? "1 renamed Java or JavaScript action" : `${n} renamed Java or JavaScript actions`}; their code is not updated.`,
  },
  javaProxies: {
    what: "Check Java code",
    note: (n) => `${documents(n)}: Java code that uses them through the generated proxies is not updated and won't compile until it is.`,
  },
  reportWidgets: {
    what: "Check report widgets",
    note: (n) => `${n === 1 ? "1 renamed dataset" : `${n} renamed datasets`} may be used by report widgets; these are not updated.`,
  },
  scheduledEvents: {
    what: "Check scheduled events in the Mendix Portal",
    note: (n) => `${n === 1 ? "1 renamed scheduled event" : `${n} renamed scheduled events`}: whether they run is set per environment, by name.`,
  },
  workflowInstances: {
    what: "Check running workflows",
    note: (n) => `${n === 1 ? "1 renamed workflow" : `${n} renamed workflows`}: running instances in deployed environments may need to be migrated.`,
  },
  queuedTasks: {
    what: "Check task queues",
    note: (n) => `${n === 1 ? "1 renamed task queue" : `${n} renamed task queues`}: tasks waiting in a deployed environment are queued by name.`,
  },
  themeImages: {
    what: "Check theme styles",
    note: (n) => `${n === 1 ? "1 renamed image or icon collection" : `${n} renamed image or icon collections`}: paths to their images in theme styles are not updated.`,
  },
  apiClients: {
    what: "Check API clients",
    note: (n) => `${n === 1 ? "1 renamed published service" : `${n} renamed published services`}: check their endpoints; clients may need to be updated.`,
  },
};

function documents(n: number): string {
  return n === 1 ? "1 renamed document" : `${n} renamed documents`;
}

// Groups in display order; empty groups are dropped.
export function buildPrefixRunLog(dialog: ProgressDialogResult, report: JobReport, change: PrefixChange): RunLog {
  const groups = [
    failedGroup(report),
    skippedDocumentsGroup(report),
    renamedGroup(report),
    updatedGroup(report),
    checkYourselfGroup(report),
    timingsGroup(report.timings),
  ].filter((group) => group.rows.length > 0);
  const outcome = buildPrefixOutcome(dialog, report, change);
  console.info(`run log: ${outcome.tone} '${outcome.text}', groups [${groups.map((g) => `${g.title} ${g.rows.length}`).join(", ")}]`);
  return { outcome, groups };
}

// The pane's one-line outcome for the dialog result.
export function buildPrefixOutcome(dialog: ProgressDialogResult, report: JobReport, change: PrefixChange): Status {
  const renamed = report.renamedDocuments.length;
  const skipped = report.skippedDocuments.length;
  const failed = report.failures.length;
  const what = describeChange(change);
  switch (dialog.result) {
    case "UserCancelled":
      return report.changedUnits > 0
        ? { tone: "warning", text: `Cancelled after renaming ${count(renamed)}; they keep their new names. See the run log.` }
        : { tone: "warning", text: "Cancelled; nothing was changed." };
    case "Failure":
      return { tone: "error", text: `Rename failed at '${dialog.failedStep?.stepTitle}': ${dialog.failedStep?.error}` };
    case "Success":
      if (renamed === 0 && skipped === 0 && failed === 0) {
        return { tone: "info", text: `No documents with prefix ${change.oldPrefix}_ found.` };
      }
      if (failed > 0) {
        return renamed > 0
          ? { tone: "warning", text: `Renamed ${count(renamed)} (${what}), but ${count(failed)} failed. See the run log.` }
          : { tone: "error", text: `${count(failed)} failed; nothing was renamed. See the run log.` };
      }
      if (renamed === 0) {
        return { tone: "warning", text: `Nothing renamed: ${count(skipped)} skipped. See the run log.` };
      }
      return skipped > 0
        ? { tone: "warning", text: `Renamed ${count(renamed)} (${what}); ${count(skipped)} skipped. See the run log.` }
        : { tone: "success", text: `Renamed ${count(renamed)} (${what}).` };
  }
}

function count(n: number): string {
  return n === 1 ? "1 document" : `${n} documents`;
}

// One row per risk of the renamed documents, in RISK_CHECKS order, then document templates.
export function checkYourselfGroup(report: JobReport): RunLogGroup {
  const perRisk = new Map<PrefixRisk, number>();
  for (const type of RENAMABLE_DOCUMENT_TYPES) {
    const n = report.renamedOfTypes(new Set([type.unitType])).length;
    if (n > 0) {
      type.risks.forEach((risk) => perRisk.set(risk, (perRisk.get(risk) ?? 0) + n));
    }
  }
  const rows: RunLogRow[] = (Object.keys(RISK_CHECKS) as PrefixRisk[])
    .filter((risk) => perRisk.has(risk))
    .map((risk) => ({ tone: "warning", what: RISK_CHECKS[risk].what, note: RISK_CHECKS[risk].note(perRisk.get(risk)!) }));
  const templates = report.documentTemplates;
  if (report.renamedDocuments.length > 0 && templates !== 0) {
    rows.push({
      tone: "warning",
      what: "Check document templates",
      note:
        templates === null
          ? "Document templates could not be listed; they are deprecated and not updated."
          : `${templates === 1 ? "1 document template is" : `${templates} document templates are`} deprecated and not updated.`,
    });
  }
  console.debug(`check yourself: ${rows.length} rows`);
  return { title: "Check yourself", rows };
}
