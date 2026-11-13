# BGS-UtilityTools

A Mendix Studio Pro extension by Blue Green Solutions: a toolbox of panes that search an app model or change it in bulk, keeping every reference intact.

It adds **Extensions ▸ BGS-UtilityTools** to Studio Pro's menu. Built on `@mendix/extensions-api` `0.11.2-mendix.11.12.2` (Studio Pro 11.12). The API is in beta and can change between Studio Pro versions.

## Installation

Download **BGS-UtilityTools** from the Mendix Marketplace into your app.

## Tools

| Tool              | What it does                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NameChanger**   | Renames a domain model entity and everything named after it: microflows, pages, associations, parameters, variables and more. Every reference to them is updated. Opened from the menu, or by right-clicking a domain model and choosing **Rename entity…**.  |
| **PreFixer**      | Renames or removes a document prefix (`ACT_Order_Save` → `SUB_Order_Save` or `Order_Save`) for one document type, and updates every reference. A prefix is 1–4 capital letters before the first underscore.                                                   |
| **ClassSearcher** | Finds every element that uses a CSS class in its Class or Dynamic classes field, in pages, snippets, layouts, building blocks and page templates. Shows the results as a tree: document, parent widget, element; click a row to open it. Only reads your app. |

All tools open as a dockable pane from **Extensions ▸ BGS-UtilityTools**.

### NameChanger

Renames one entity and carries the new name through the app.

1. Pick a module and an entity, and enter the new name. Or right-click a domain model (App Explorer or domain model editor) and choose **Rename entity…**; the pane opens with that module selected.
2. Start the rename. The tool plans every change first, then renames the entity, then the related documents, then rewrites every reference.

**What gets renamed:** every name that contains the entity name, with exact case (`Order` matches `OrderOverview`, not `order`):

- documents: microflows, nanoflows, rules, pages, snippets, workflows, import and export mappings, JSON structures (only when a mapping for the entity uses them), message definitions, datasets, Java and JavaScript actions, published REST, OData and web services, view entity sources;
- associations, in every module;
- parameters and variables in flows, and page and snippet parameters.

Names of other entities that contain the old name are protected: renaming `Order` leaves `OrderLine` and `PurchaseOrder` alone, and so everything named after them.

**Never renamed** (references in them are still updated where possible): consumed REST/OData and imported web services, layouts, menus, scheduled events, page templates, building blocks, enumerations, constants, ML model mappings, database connections, Excel importer templates, connectors, business event and change data capture services. Document templates are not touched at all.

**Validation:** the new name must start with a letter, hold only letters, digits and underscores, not be a reserved word, and not be taken in the module.

### PreFixer

Changes a document prefix across all of your own modules.

- A prefix is 1–4 capital letters before the first underscore: `ACT_Order_Save` has prefix `ACT`; `Act_Order_Save`, `V2_Order_Save` and `ACT_` have none.
- Prefixes are listed per document type, with a count and an example. Microflows and nanoflows share one list; every other type has its own.
- Choose a prefix, then enter a new one (1–4 capitals) or tick **Remove prefix**.

A document is skipped, and listed in the run log with the reason, when:

- the new name already exists in the module (also when it only differs in case), or is invalid or reserved (removing `ACT_` from `ACT_1Order` gives `1Order`);
- an entity, association or module role in the module has the same old or new name;
- a Marketplace module uses it, since that reference can't be updated.

Domain models, module settings, module security, view entity sources, document templates and documents of other extensions are never renamed.

### ClassSearcher

Finds where a CSS class is used. It never changes your app.

- Enter one class name; a leading `.` is ignored (`.card` = `card`).
- The match is exact and case-sensitive, like CSS: `card` doesn't match `card--big` or `Card`.
- Searches the **Class** field, and the string literals in the **Dynamic classes** expression. A class built from parts (`'card--' + $Status`) can't be found.
- Searches pages, snippets, layouts, building blocks and page templates in your own modules; Marketplace modules are skipped.
- Results show as a tree: document › parent widget › element. Click a row to open it in Studio Pro.

### Before you run the NameChanger or PreFixer

- **Commit your app first.** A run saves many documents at once; version control is your way back.
- Studio Pro is blocked while a run is going; a progress dialog shows each step.
- Marketplace modules and System are never changed.
- Read the run log afterwards. **Check yourself** lists what the tool can't update: Java and JavaScript code, navigation, App Settings, constant values in configurations, and so on.

## Credits

Made by Thom Hopstaken · Blue Green Solutions.

## License

MIT, see `LICENSE`.
