import * as Mx from "@mendix/extensions-api";
import type { RenameReport } from "./framework/RenameReport";
import { setQualifiedName } from "./moduleModel";

import markup from "./ui/index.html";
import styles from "./ui/styles.css";

//Loads UI from HTML and CSS files.
export function loadUI(preference: Mx.Preferences): void {
  console.log("UI import started");
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.append(style);
  if (preference.theme === "Dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    console.log("Dark mode enabled");
  } else {
    document.documentElement.removeAttribute("data-theme");
    console.log("light mode enabled");
  }
  const root = document.getElementById("root")!;
  root.innerHTML = markup;
  console.log("UI import ended");
}

export async function populateDropdown(
  entities: Mx.DomainModels.Entity[],
  domainModels: readonly Readonly<Mx.Primitives.UnitInfo>[],
) {
  const dropdown = document.getElementById("entityDropdown")!;
  try {
    dropdown.innerHTML = "";

    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Select an entity --";
    dropdown.appendChild(defaultOption);

    // Add entities to dropdown
    entities.forEach((entity: Mx.DomainModels.Entity) => {
      const option = document.createElement("option");
      option.value = entity.$ID;
      option.textContent = setQualifiedName(entity, domainModels);
      dropdown.appendChild(option);
    });
  } catch (error: any) {
    showStatus(`Could not load entities: ${error.message}`, "error");
  }
}

export function initGroupBoxes(): void {
  document.querySelectorAll(".groupbox-title").forEach((groupboxTitle) => {
    groupboxTitle.addEventListener("click", () => {
      console.trace(`Groupbox ${groupboxTitle.id} opened`);
      const groupbox = groupboxTitle.parentElement!;
      groupbox.classList.toggle("open");
    });
  });
}

// Second guard next to the modal progress dialog: no new run can start while one is busy.
export function setBusy(busy: boolean): void {
  console.debug(`pane busy: ${busy}`);
  for (const id of ["changeName", "entityDropdown", "nameInput", "renamePages"]) {
    const element = document.getElementById(id) as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | null;
    if (element !== null) {
      element.disabled = busy;
    }
  }
}

export function clearNameInput(): void {
  const input = document.querySelector<HTMLInputElement>("#nameInput");
  if (input !== null) {
    input.value = "";
    console.debug("name input cleared");
  }
}

export function isRenamePagesChecked(): boolean {
  return document.querySelector<HTMLInputElement>("#renamePages")?.checked ?? false;
}

export function showReport(dialog: Mx.ProgressDialogResult, report: RenameReport): void {
  switch (dialog.result) {
    case "Success":
      showStatus(
        report.entityRenamed ? "Rename finished." : "Rename finished, entity not renamed.",
        report.entityRenamed ? "success" : "warning",
      );
      break;
    case "UserCancelled":
      showStatus("Rename cancelled; documents updated so far are kept. Rerun to finish.", "warning");
      break;
    case "Failure":
      showStatus(`Rename failed at '${dialog.failedStep?.stepTitle}': ${dialog.failedStep?.error}`, "error");
      break;
  }
  for (const line of report.summary()) {
    showStatus(line, line.startsWith("Failed") ? "error" : "info");
  }
}

export function showStatus(message: string, type: string): void {
  const newStatusDiv = document.createElement("div");
  newStatusDiv.textContent = message;
  newStatusDiv.className = "status " + type;

  const logContainer = document.getElementById("logContainer")!;
  logContainer.appendChild(newStatusDiv);
}
