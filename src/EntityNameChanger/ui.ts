import * as Mx from "@mendix/extensions-api";
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

export function showStatus(message: string, type: string): void {
  const newStatusDiv = document.createElement("div");
  newStatusDiv.textContent = message;
  newStatusDiv.className = "status " + type;

  const logContainer = document.getElementById("logContainer")!;
  logContainer.appendChild(newStatusDiv);
}
