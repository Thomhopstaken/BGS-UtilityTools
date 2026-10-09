# BGS-UtilityTools: Project Overview

## 1. What you're building

BGS-UtilityTools is a **plug-in for Mendix Studio Pro**, the desktop IDE that Mendix developers use to build low-code apps. It's written in TypeScript and loads inside Studio Pro as a *web extension*: a small web app that Studio Pro hosts in an embedded browser (WebView2) and that can read and change the Mendix app model the developer has open.

The plan is to build a toolbox of productivity utilities (see `ToDo.md`):

| # | Tool | Status |
|---|---|---|
| 1 | **Entity Name Changer**: rename an entity along with everything named after it | In progress (the only tool so far) |
| 2 | Prefix updater: list the naming prefixes in use and bulk-rename them | Planned |
| 3 | CSS class searcher: find, remove, or add CSS classes across pages | Planned |
| 4 | Microflow color palette: color action activities based on markers | Planned |

### The problem the Entity Name Changer solves

When you rename an entity in Mendix (for example `Customer` to `Client`), Studio Pro updates *references* to it, but not the **names** people derived from it. Microflows are still called `ACT_Customer_Create`, variables are still `$NewCustomer` and `$CustomerList`, and so on. The Entity Name Changer finds those derived names and renames them as well, so the model stays consistent.

---

## 2. How it fits together

```
Studio Pro
 ├─ loads dist/BGS-UtilityTools/manifest.json
 │
 ├─ main.js  (src/main.ts), background component, runs at startup
 │    ├─ registers a dockable pane "EntityNameChanger" (right side)
 │    └─ adds Extensions ▸ BGS-UtilityTools ▸ EntityNameChanger menu item → opens pane
 │
 └─ dockablepane.js  (src/EntityNameChanger/main.ts), runs inside the pane's WebView
      ├─ ui.ts             inject HTML/CSS, theme, dropdown, status log
      ├─ moduleModel.ts    list modules, skip App Store + System, load entities
      ├─ microflowRenamer.ts  walk all microflows, find relevant actions
      └─ MicroflowHelper.ts   decide what to rename + rewrite expressions
```

### Build pipeline

- `npm run build` runs `tsc --noEmit` (type-check only), then `build-extension.mjs` (esbuild).
- esbuild bundles both entry points as ESM for the browser. `.html` and `.css` files are imported as **plain strings** (the `text` loader), which is how `ui.ts` can do `root.innerHTML = markup`.
- Two custom esbuild plugins in `build.helpers.mjs`:
  - `copyManifestPlugin` copies `src/manifest.json` into `dist/`.
  - `copyToAppPlugin` wipes `<MendixApp>/extensions/BGS-UtilityTools` and copies the build there, so Studio Pro picks it up.
- `npm run build:dev` does the same in watch mode.
- `.vscode/launch.json` starts Studio Pro with the test app and the `--enable-extension-development --enable-web-extensions` flags, and attaches the VS Code debugger to the WebView.

> ⚠️ `appDir` in `build-extension.mjs` and the paths in `launch.json` point to `C:\Users\Thom\...`, but this machine's profile is `C:\Users\ThomHopstaekn\...`. If that folder doesn't exist, the build prints "Could not find Mendix application directory" and **doesn't deploy**. It's worth reading this path from an env var or a local config file.

### The rename flow, step by step

1. **Startup** (`EntityNameChanger/main.ts`): gets the Studio Pro API, applies the light or dark theme, lists modules, builds a set of App Store module names (plus `System`) to skip, loads the domain models of your own modules, and fills the dropdown with `Module.Entity` names.
2. **Click "Change Name"**: checks that an entity is selected and that the new name matches `^[A-Za-z]\w*$`.
3. **`ChangeMicroflowNames`**: loads every microflow in non-App-Store modules. For each one:
   - It collects all `ActionActivity` objects, recursing into loops.
   - **Detection pass:** for each action type that *produces* an entity-typed variable (Create Object, Create List, Retrieve from database or by association, Microflow Call that returns the entity, and List Operations on an already-tracked list), `MicroflowHelper` checks whether it targets the chosen entity. If it does, the helper records an `ActionHelper(oldVarName → newVarName)`, where the new name is the old one with the entity name replaced by the new name.
   - **Rename pass:** `updateActionNames()` sets each recorded `outputVariableName`.
   - **Usage pass:** `updateActionUsages()` is a large `switch` over about 40 microflow action types. It runs every expression and variable-name field through `UpdateValue()`, which looks for `$Variable` tokens and swaps the old names for the new ones.
   - The microflow itself is renamed if its name contains the entity name, and then it's saved.
4. If everything succeeds, the entity itself is renamed and saved, and the dropdown reloads.

---

## 3. The Mendix library: `@mendix/extensions-api`

### What it is

`@mendix/extensions-api` is Mendix's official **Web Extensibility API** for Studio Pro. Studio Pro 10.x and later support two kinds of extensions:

- **C#/.NET extensions**, the older and more powerful route, which run inside Studio Pro's .NET process.
- **Web extensions**, which are what you're using. They're JavaScript/TypeScript running in an embedded Chromium WebView and talk to Studio Pro through a message bridge.

This npm package is the TypeScript side of that bridge. It's versioned per Studio Pro release (`0.11.4-mendix.11.12.4` means API 0.11.4 for Studio Pro 11.12.4) and is still **beta**. Your own UI text already says so, and it explains why some model elements can't be reached yet. The package is one 347 KB `index.d.ts` plus a thin `index.js`, so nearly all of its "documentation" is in the type definitions.

### The component model

Every entry point exports a `component: IComponent` with a `loaded(context)` hook. Studio Pro calls that hook once the script is loaded. `ComponentContext` identifies which extension and entry point is calling, and whether it runs in `"ui"` mode or `"headless"` mode (build-time extensions with no UI). You pass the context to `getStudioProApi(context)` to get the API object:

```ts
const studioPro = getStudioProApi(componentContext);
```

The manifest (`src/manifest.json`) tells Studio Pro which JS file is `main` (loaded at startup) and which files are UI entry points (loaded when a pane, tab, or dialog opens).

### What `StudioProApi` gives you

```
studioPro
├─ app
│   ├─ model            ← read/write the Mendix app model (the important part)
│   │    domainModels, microflows, nanoflows, modules, pages, snippets, layouts,
│   │    enumerations, constants, workflows, javaActions, rules, scheduledEvents,
│   │    rest/odata/web services, mappings, json structures, module security, …
│   ├─ files            ← read/write files in the app directory
│   └─ projectChanges   ← subscribe to model change events
├─ ui
│   ├─ extensionsMenu   ← add items to the Extensions menu        (you use this)
│   ├─ panes            ← register/open/close dockable panes     (you use this)
│   ├─ preferences      ← theme, language, etc.                  (you use this)
│   ├─ tabs, dialogs    ← open your own web UIs as tabs/modal dialogs
│   ├─ messageBoxes     ← native info/warning/confirm boxes
│   ├─ notifications    ← toast popups
│   ├─ editors, documents, appExplorer, elementSelectors
│   ├─ messagePassing   ← talk between your main.js and your UI entry points
│   └─ versionControl, extensionPermissions, commands
├─ network.httpProxy    ← make HTTP calls via Studio Pro's backend (bypasses CORS)
└─ runtime              ← start/stop the local runtime, read runtime config
```

### How model access works (key concepts)

**Units and elements.** A Mendix model is a tree. *Units* are top-level documents that load independently: a DomainModel, a Microflow, a Page. *Elements* live inside units: an Entity sits inside a DomainModel, and an ActionActivity sits inside a Microflow.

**Lazy loading.** Loading the whole model would be expensive, so each model API offers:
- `getUnitsInfo()`, which returns cheap metadata (`$ID`, `$Type`, `name`, `moduleName`) for every unit of that type. You use this to filter out App Store modules before loading anything.
- `loadAll(filter, maxUnitsToLoad)`, which fully loads the matching units. **`maxUnitsToLoad` defaults to 10.** That's why your code passes `ids.length` and `modulelist.length - appStoreList.size`. Without it you'd silently get only 10 microflows.
- `load(type, id)` and `resolve(type, qualifiedName)` fetch a single element.

**Typed proxies.** Loaded objects are plain JS objects typed by big namespaces (`DomainModels`, `Microflows`, `Pages`, `DataTypes`, …). Every object has a `$Type` string such as `"Microflows$RetrieveAction"` and a `$ID`. TypeScript narrows the union types on `$Type`, which is why `switch (action.$Type)` gives you the correct properties in each `case`.

**References are strings.** Pointers to other documents are qualified names, not objects. `CreateObjectAction.entity` is `"MyModule.Customer"`, and `MicroflowCallAction.microflowCall.microflow` is `"MyModule.ACT_Foo"`. Your code compares against `entityQname` and does `split(".")` for this reason.

**Navigating up.** `getContainer(element)` returns the parent. You use it to go from an Entity to its DomainModel, and from the DomainModel to its module name.

**Writing.** You change properties directly (`action.outputVariableName = "..."`) and then call `api.save(unit)`, which returns a Promise. There's also `applyChanges(operations)` for batched operations, plus `createElement`, `createUnit`, and `deleteUnit`.

**Expressions are opaque strings.** Microflow expressions and XPath constraints come through as raw text such as `"$Customer/Name + ' x'"`. The API doesn't parse them, which is why you wrote the `$Variable` regex in `UpdateValue`.

**Current limitations.** Some action types (REST calls, web services, synchronization, email) expose little or nothing yet, and there's no built-in "rename with refactoring" operation. Your tool is effectively building that refactoring by hand on top of raw model access.

---

## 4. Things I noticed while reading the code

These are issues worth checking. Nothing here has been changed.

1. **`UpdateValue` never replaces anything** (`MicroflowHelper.ts:461`). `for (const CalledVariable in calledVariables)` iterates over the array's **indices** (`"0"`, `"1"`), not the matched strings, so `` `$${ah.oldOutVarName}` === CalledVariable `` is never true. It should be `for ... of`. Also, `newValue = value.replaceAll(...)` starts from `value` each time, so only the last replacement would survive. Use `newValue.replaceAll(...)`.
2. **Saves aren't awaited** (`main.ts:35`, `microflowRenamer.ts:87`). `domainModels.save(entity)` and `microflows.save(flow)` return Promises. Not awaiting them, and saving an *element* (the entity) instead of its *unit* (the DomainModel), is a likely cause of the "this is somehow not working" comment.
3. **`actionHelperList` is shared across all microflows.** One `MicroflowHelper` is reused for every flow and never cleared. After the first flow with a match, every later flow passes the `length === 0` check, gets saved, and has its usages rewritten using variable names from other flows.
4. **The microflow call lookup ignores the module** (`microflowRenamer.ts:47`). It matches only on the part after the dot, so two modules with an `ACT_Get` microflow can collide. Called microflows in App Store modules are never found.
5. **Copy-paste bug in `MLModelCallAction`** (`MicroflowHelper.ts:328`): `mlMappingDocument` gets `UpdateValue(action.inputVariableName)`.
6. **Substring renaming.** `replaceAll(entity.name, newName)` also changes names that merely contain the entity name, so renaming `Order` also changes `$OrderLine` and `ACT_OrderLine_...`. That's harmless for variables tied to other entities only because detection filters them first, but microflow names aren't filtered.
7. **The UI promises more than the code does.** The "Also rename pages" checkbox isn't wired up, associations aren't renamed, and the parameters loop (`microflowRenamer.ts:73`) only logs indices.
8. **The success status** passes `result` (`"Success"`) as the CSS class. `styles.css` may expect `success` in lowercase.

---

## 5. Repo map

```
build-extension.mjs     esbuild entry/config + deploy target (appDir)
build.helpers.mjs       shared esbuild config + copy-manifest / copy-to-app plugins
src/manifest.json       tells Studio Pro which JS is main vs. UI entry point
src/main.ts             registers pane + Extensions menu
src/global.d.ts         lets TS import .html/.css as strings
src/EntityNameChanger/
  main.ts               pane logic & button handler
  ui.ts                 DOM helpers
  ui/index.html, styles.css
  moduleModel.ts        module/entity loading, qualified names
  microflowRenamer.ts   microflow traversal
  MicroflowHelper.ts    detection + rename + expression rewriting
ToDo.md                 roadmap
```

---

## 6. Entity Name Changer: documents to look at later

These are the "What you need to check yourself" items from the pane's help. The Entity Name Changer doesn't handle them yet, so they need a manual check after a rename.

The **Cause** column says why:
- **API restriction**: the Extensibility API (0.11.4 / Studio Pro 11.12) gives no way to read or change it. All 53 microflow activity types in the API are handled; none is restricted.
- **Not implemented**: the API exposes it, but the tool doesn't use it yet.
- **By design**: deliberately left alone.

| Document / element | Not handled today | Cause |
|---|---|---|
| Navigation (menu items, home pages, role-based home pages, login page) | References to renamed pages, microflows and nanoflows | **API restriction**: navigation is not in the API. The run log warns instead. |
| Java action source code (`javasource/`) | Code using the old entity or proxy class names | **API restriction**: code is not part of the model API. It could be done through `app.files`, but that is risky. |
| JavaScript action source code | Code using the old names | **API restriction**: same as Java. |
| Rules | Rule names and rule parameters (references inside are updated) | Not implemented (stub updater) |
| Workflows | Names | Not implemented (stub updater) |
| Import and export mappings | Names | Not implemented (stub updater) |
| JSON structures | Names and entity references (not in the reference pass) | Not implemented (stub updater) |
| Message definitions | Names | Not implemented (stub updater) |
| Document templates | Names and parameters | Not implemented (stub updater) |
| Datasets | Names and parameters | Not implemented (stub updater) |
| Java and JavaScript actions (model side) | Names, and entity types in parameters and return types (not in the reference pass) | Not implemented: `javaActions` and `javaScriptActions` are in the API |
| Consumed REST and OData services | Entity references (not in the reference pass) | Not implemented: in the API |
| ML model mappings | Entity references (not in the reference pass) | Not implemented: `mlMappingDocuments` is in the API |
| View entity source documents (OQL) | The entity name in OQL queries | Not implemented: `viewEntitySourceDocuments` is in the API. |
| Published REST, OData and web services | Document names and exposed names (references inside are updated) | By design: exposed names are an external contract |
| Marketplace modules and System | Everything | By design: Marketplace content is read-only |
