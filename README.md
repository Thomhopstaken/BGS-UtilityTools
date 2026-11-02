# BGS-UtilityTools

A Mendix Studio Pro extension by Blue Green Solutions: a toolbox of panes that change an app model in bulk and keep every reference intact.

It adds **Extensions ▸ BGS-UtilityTools** to Studio Pro's menu. Built on `@mendix/extensions-api` `0.11.2-mendix.11.12.2` (Studio Pro 11.12). The API is in beta and can change between Studio Pro versions.

## Installation

Download **BGS-UtilityTools** from the Mendix Marketplace into your app <!-- TODO: Marketplace link once listed -->, then reopen the app in Studio Pro 11.12.2 or above

## Tools

| Tool            | What it does                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NameChanger** | Renames a domain model entity and everything named after it: microflows, pages, associations, parameters, variables and more. Every reference to them is updated. Opened from the menu, or by right-clicking a domain model and choosing **Rename entity…**. |
| **Prefixer**    | Renames or removes a document prefix (`ACT_Order_Save` → `SUB_Order_Save` or `Order_Save`) for one document type, and updates every reference. A prefix is 1–4 capital letters before the first underscore.                                                  |

Planned: a CSS class searcher and a microflow color palette (`ToDo.md`).

### Before you run a tool

- **Commit your app first.** A run saves many documents at once; version control is your way back.
- Studio Pro is blocked while a run is going; a progress dialog shows each step.
- Marketplace modules and System are never changed.
- Read the run log afterwards. **Check yourself** lists what the tool can't update: Java and JavaScript code, navigation, App Settings, constant values in configurations, and so on.

## Credits

Made by Thom Hopstaken · Blue Green Solutions.

## License

MIT, see `LICENSE`.
