import { ComponentContext, IComponent } from "@mendix/extensions-api";
import markup from "./index.html";
import styles from "./styles.css";
export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        const style = document.createElement("style");
        style.textContent = styles;
        document.head.append(style);
        const root = document.getElementById("root")!;
        root.innerHTML = markup;

        document
            .querySelectorAll(".groupbox-title")
            .forEach((groupboxTitle) => {
                groupboxTitle.addEventListener("click", () => {
                    console.log(`Groupbox ${groupboxTitle.id} opened`);
                    const groupbox = groupboxTitle.parentElement!;
                    groupbox.classList.toggle("open");
                });
            });
    },
};
