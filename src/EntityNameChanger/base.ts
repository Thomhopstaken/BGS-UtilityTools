import { DomainModels } from "@mendix/extensions-api";

export async function populateDropdown(entities: DomainModels.Entity[]) {
    const dropdown = document.getElementById("entityDropdown")!;
    try {
        dropdown.innerHTML = "";

        // Add default option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Select an entity --";
        dropdown.appendChild(defaultOption);

        // Add entities to dropdown
        entities.forEach((entity: DomainModels.Entity) => {
            const option = document.createElement("option");
            option.value = entity.$ID;
            option.textContent = entity.name;
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
