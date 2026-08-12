import {
    ComponentContext,
    IComponent,
    Preferences,
    Primitives,
    StudioProApi,
    getStudioProApi,
    DomainModels,
} from "@mendix/extensions-api";
import markup from "./ui/index.html";
import styles from "./ui/styles.css";

export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        const studioPro = getStudioProApi(componentContext);
        loadUI(await studioPro.ui.preferences.getPreferences());
        const entities = await getEntities(studioPro);

        initGroupBoxes();
    },
};

async function getEntities(
    studioPro: StudioProApi,
): Promise<DomainModels.Entity[]> {
    const { domainModels, modules } = studioPro.app.model;
    const modulelist = await modules.getModules();
    const appStoreList = getAppstoreModuleNames(modulelist);

    const DomainModelUnits = await domainModels.loadAll(
        (info: Primitives.UnitInfo) =>
            info.moduleName !== undefined && !appStoreList.has(info.moduleName),
        modulelist.length - appStoreList.size,
    );
    console.log(DomainModelUnits);

    const entities: DomainModels.Entity[] = [];
    DomainModelUnits.forEach((domainModel: DomainModels.DomainModel) => {
        entities.push(...domainModel.entities);
    });
    console.log(entities);
    return entities;
}

function getAppstoreModuleNames(modulelist: any): Set<string> {
    const appStoreList = new Set<string>(["System"]);
    modulelist.forEach((module: any) => {
        if (module.fromAppStore) {
            appStoreList.add(module.name);
        }
    });
    console.trace(appStoreList);
    return appStoreList;
}

//Loads UI from HTML and CSS files.
function loadUI(preference: Preferences): void {
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

//toggles GroupBoxes
function initGroupBoxes(): void {
    document.querySelectorAll(".groupbox-title").forEach((groupboxTitle) => {
        groupboxTitle.addEventListener("click", () => {
            console.trace(`Groupbox ${groupboxTitle.id} opened`);
            const groupbox = groupboxTitle.parentElement!;
            groupbox.classList.toggle("open");
        });
    });
}

async function populateDropdown(entityNames: string) {
    const dropdown = document.getElementById("entityDropdown")!;
    try {
        const entities = entityNames.split(",");

        dropdown.innerHTML = "";

        // Add default option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Select an entity --";
        dropdown.appendChild(defaultOption);

        // Add entities to dropdown
        entities.forEach((entity) => {
            const option = document.createElement("option");
            option.value = entity;
            option.textContent = entity;
            dropdown.appendChild(option);
        });
    } catch (error: any) {
        showStatus(`Could not load entities: ${error.message}`, "error");
    }
}

function showStatus(message: string, type: string): void {
    const newStatusDiv = document.createElement("div");
    newStatusDiv.textContent = message;
    newStatusDiv.className = "status " + type;

    const logContainer = document.getElementById("logContainer")!;
    logContainer.appendChild(newStatusDiv);
}
