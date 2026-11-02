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

When you rename an entity in Studio Pro (for example `Customer` to `Client`), the **names** people derived from it stay unchanged. Microflows are still called `ACT_Customer_Create`, variables are still `$NewCustomer` and `$CustomerList`, and so on. The Entity Name Changer finds those derived names and renames them as well, so the model stays consistent.

A rename through the extensions API updates no references at all, not even to the entity itself. So the tool also rewrites every reference to the entity and to each document, parameter and association it renames.

---

## 2. How it fits together

```
Studio Pro
 ├─ loads dist/BGS-UtilityTools/manifest.json
 │
 ├─ main.js  (src/main.ts), background component, runs at startup
 │    ├─ registers the dockable pane "Entity Name Changer" (right side)
 │    └─ adds Extensions ▸ BGS-UtilityTools ▸ Entity Name Changer → opens the pane
 │
 └─ dockablepane.js  (src/EntityNameChanger/main.ts), runs inside the pane's WebView
      ├─ main.ts                  wiring only: Studio Pro APIs in, view and controller out
      ├─ ui/PaneView.ts, pane.html  the DOM, built on the BGS-UtilityTools design system
      ├─ EntityNameChangerPane.ts  controller without the DOM: load, pick, validate, rename, report
      ├─ moduleModel.ts            modules and entities for the pickers; skips Marketplace + System
      ├─ renameService.ts          wires the framework for one rename
      ├─ framework/                the rename job: steps, plans, rename map, report
      └─ updaters/                 one updater per document type and phase
```

### Build pipeline

- `npm run build` runs `tsc --noEmit` (type-check only), then `build-extension.mjs` (esbuild).
- esbuild bundles both entry points as ESM for the browser. `.html`, `.css` and `.svg` files are imported as **plain strings** (the `text` loader), so markup and styles are injected at runtime.
- Two custom esbuild plugins in `build.helpers.mjs`:
  - `copyManifestPlugin` copies `src/manifest.json` into `dist/`.
  - `copyToAppPlugin` wipes `<MendixApp>/extensions/BGS-UtilityTools` and copies the build there, so Studio Pro picks it up. The app folder is `appDir` in `build-extension.mjs`.
- `npm run build:dev` does the same in watch mode.
- `npm test` runs the unit tests (Vitest, node environment, `src/**/*.test.ts`). They use plain-object fakes; the Mendix runtime is never loaded.
- `.vscode/launch.json` starts Studio Pro with a test app and the `--enable-extension-development --enable-web-extensions` flags, and attaches the VS Code debugger to the WebView.

### The rename flow, step by step

1. **Startup** (`EntityNameChanger/main.ts`): applies the Studio Pro theme, mounts the pane and loads the app's own modules and their entities into the pickers.
2. **Submit** (`EntityNameChangerPane.submit`): validates the request (`validation.ts`: name format, reserved names, a name already taken in the module). `renameService.runEntityRename` then builds the context, the updaters (`updaters/updaterRegistry.ts`) and the job.
3. **The job** (`framework/RenameJob.ts`) runs in Studio Pro's modal progress dialog, one step per updater. Each step lists its units (`getUnitsInfo`), skips Marketplace modules and System, and loads, updates and saves them in batches of 25 (`framework/RenamePlanner.ts`).

   | Phase | What it does |
   |---|---|
   | Prepare | Checks the entity can be renamed and collects every document name per module (`DocumentNameRegistry`). Changes nothing. |
   | Plan | Read-only. Microflows, nanoflows, rules, pages, snippets, workflows, mappings, JSON structures and associations decide which documents, parameters and associations get a new name. Every rename is recorded in `QualifiedNameRenames` (old → new qualified name). This is the only phase that calls `resolve()`. |
   | Entity | `EntityRenameStep` renames the entity and the planned associations in its own domain model, and rewrites that domain model's references, in one save. |
   | Rename | Applies the plan: associations in other modules, then documents, parameters and variables in flows, pages, workflows and mappings, with every expression that uses them. |
   | References | `ReferenceUpdater` rewrites every renamed qualified name in every string property of each document type in `REFERENCE_DOCUMENT_TYPES`. Domain models go first. |
   | Refresh | Saves changed pages and snippets again, so Studio Pro drops stale consistency errors. |

4. **Result**: `framework/RenameReport.ts` collects what changed, what was skipped and what failed. The pane shows it as a run log (`ui/runLog.ts`), with a warning when navigation may point to renamed documents.

Names are matched exact-case, and a name that is part of another entity's name is left alone (`framework/NamingPolicy.ts`). A rename onto a name that already exists is skipped and counted.

---

## 3. The Mendix library: `@mendix/extensions-api`

### What it is

`@mendix/extensions-api` is Mendix's official **Web Extensibility API** for Studio Pro. Studio Pro 10.x and later support two kinds of extensions:

- **C#/.NET extensions**, the older and more powerful route, which run inside Studio Pro's .NET process.
- **Web extensions**, which are what you're using. They're JavaScript/TypeScript running in an embedded Chromium WebView and talk to Studio Pro through a message bridge.

This npm package is the TypeScript side of that bridge. It's versioned per Studio Pro release (`0.11.4-mendix.11.12.4` means API 0.11.4 for Studio Pro 11.12.4) and is still **beta**: it changes between releases, and the docs are minimal. The package is one 347 KB `index.d.ts` plus a thin `index.js`, so nearly all of its "documentation" is in the type definitions.

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
│   │    domainModels, microflows, nanoflows, rules, pages, snippets, layouts,
│   │    modules, projects, enumerations, constants, workflows, java(Script)Actions,
│   │    scheduledEvents, rest/odata/web services, mappings, json structures, …
│   ├─ files            ← read/write files in the app directory
│   └─ projectChanges   ← subscribe to model change events
├─ ui
│   ├─ extensionsMenu   ← add items to the Extensions menu        (you use this)
│   ├─ panes            ← register/open/close dockable panes     (you use this)
│   ├─ preferences      ← theme, language, etc.                  (you use this)
│   ├─ dialogs          ← modal dialogs, incl. the progress dialog  (you use this)
│   ├─ tabs             ← open your own web UIs as tabs
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
- `getUnitsInfo()`, which returns cheap metadata (`$ID`, `$Type`, `name`, `moduleName`) for every unit of that type. The job uses this to skip Marketplace modules and System before loading anything.
- `loadAll(filter, maxUnitsToLoad)`, which fully loads the matching units. **`maxUnitsToLoad` defaults to 10.** The job always passes the batch size (`RenameJob.ts`); without it you'd silently get only 10 units.
- `load(type, id)` and `resolve(type, qualifiedName)` fetch a single element. The tool calls `resolve()` only in the plan phase; during writes it could leave loaded copies stale.
- `projects.getModulesTree()` lists every module, folder and document. The prepare step uses it to know which document names are taken.

**Typed proxies.** Loaded objects are plain JS objects typed by big namespaces (`DomainModels`, `Microflows`, `Pages`, `DataTypes`, …). Every object has a `$Type` string such as `"Microflows$RetrieveAction"` and a `$ID`. TypeScript narrows the union types on `$Type`, which is why `switch (action.$Type)` gives you the correct properties in each `case`. The types are not always right at runtime: rules have no `parameters` list although the typings declare one.

**References are strings.** Pointers to other documents are qualified names, not objects. `CreateObjectAction.entity` is `"MyModule.Customer"`, and `MicroflowCallAction.microflowCall.microflow` is `"MyModule.ACT_Foo"`. Studio Pro does not update these strings when the target is renamed, so the tool rewrites them itself (`updaters/shared/qualifiedNameRewrite.ts`).

**Navigating up.** `getContainer(element)` returns the parent. The pane uses it to go from an Entity to its DomainModel (`entityPicker.ts`).

**Writing.** You change properties directly (`action.outputVariableName = "..."`) and then await `api.save(unit)`. Studio Pro checks a document only when it is saved. There's also `applyChanges(operations)` for batched operations, plus `createElement`, `createUnit`, and `deleteUnit`.

**Expressions are opaque strings.** Microflow expressions and XPath constraints come through as raw text such as `"$Customer/Name + ' x'"`. The API doesn't parse them, so the tool rewrites `$Variable` tokens itself and skips quoted literals (`updaters/shared/variableRewrite.ts`).

**Current limitations.** There's no built-in "rename with refactoring" operation, so the tool builds that refactoring by hand on top of raw model access. Navigation and Java/JavaScript source code are not reachable through the model API (see §6).

---

## 4. Things to know

**Studio Pro behaviour the design depends on**
- **Studio Pro updates no references itself.** Renaming an element through the API leaves every reference to it unchanged. That is why the tool records every rename and rewrites references in a separate pass.
- **A document is checked only when it is saved.** Studio Pro does not re-check a document when a name it refers to appears later. So every document gets its last save after all the names it references exist, and pages and snippets get an extra refresh save.
- **The typings don't always match runtime.** Rules have no `parameters` list at runtime, although the typings declare one. Nanoflows hold their parameters only in the object collection. Code guards against a missing property instead of trusting the type.
- **`loadAll` loads 10 units by default.** The job always passes the number of units it wants.

**Limitations**
- **A failed run can't be repaired by running again.** The entity is renamed before the documents, and the rename map is not stored. After a failure or a cancel, the error list has to be fixed by hand. The run log says so.
- **Navigation is not in the API.** Menu items, home pages and the login page that point to renamed documents are not updated; the run log warns instead.
- See §6 for the document types that are not handled yet.

**Open assumptions (marked `UNVERIFIED:` in the code)**
- Association `parent`/`child` may be an `$ID` or a qualified name, so both are checked (`associationRename.ts`, `MicroflowHelper.ts`, `ReferenceCache.ts`).
- Element proxies enumerate their properties with `Object.keys`. The generic reference rewrite depends on this (`elementWalker.ts`).
- The format of parameter references: `PageVariable.pageParameter` may be bare or `Module.Page.Param`, and Java action mapping parameters are expected to end with `.<name>`. Page URL placeholders are expected as `{Param}` (`PageHelper.ts`, `MicroflowHelper.ts`).
- Which of a microflow's two parameter lists Studio Pro treats as leading. Both are kept in sync.
- How sequence flows are stored: flow origins are expected to be object `$ID`s, with flows inside loops also in `flow.flows`.
- Which email fields are expressions, and whether an attachment is a bare variable name.
- The format of REST operation references, and `resolve()` on elements that are not units (`ReferenceResolver.ts`).
- Rule parameters are expected as parameter objects, like microflow parameters (`FlowUpdater.ts`).
- Whether the workflow parameter can be renamed, and the `Module.Workflow.Param` format in workflow call mappings (`WorkflowInspector.ts`).
- Whether an export mapping's `parameterName` is referenced anywhere else (`MappingInspector.ts`).

**Machine-specific paths**
- `appDir` in `build-extension.mjs` points to a Mendix app on this machine. If the folder doesn't exist, the build doesn't deploy.
- `.vscode/launch.json` still points to `C:\Users\Thom\...`. It's worth reading both paths from an environment variable or a local config file.

---

## 5. Repo map

```
build-extension.mjs        esbuild entry points and deploy target (appDir)
build.helpers.mjs          shared esbuild config, copy-manifest and copy-to-app plugins
vitest.config.ts           unit test config
ToDo.md                    roadmap
src/manifest.json          tells Studio Pro which JS is main and which is a UI entry point
src/main.ts                registers the pane and the Extensions menu
src/global.d.ts            lets TS import .html/.css/.svg as strings
src/shared/design/         BGS-UtilityTools design system: tokens.css, bundle.css, theme, pane mount, DOM helpers, status
src/EntityNameChanger/
  main.ts                  pane entry point (wiring only)
  EntityNameChangerPane.ts pane controller
  entityPicker.ts          entity options for the pickers
  moduleModel.ts           loading modules and entities; Marketplace modules and System
  validation.ts            request and name checks
  renameService.ts         builds and runs one rename job
  ui/                      pane.html, PaneView.ts (DOM), runLog.ts (report → run log)
  framework/               RenameJob, RenamePlanner (batches), PrepareStep, EntityRenameStep,
                           NamingPolicy, QualifiedNameRenames, DocumentNameRegistry,
                           DocumentRenamePlan, AssociationRenamePlan, RenameReport, UnitInfoCache, types
  updaters/
    updaterRegistry.ts     every updater per phase; the only place that touches app.model
    microflows/            FlowUpdater (microflows, nanoflows, rules), MicroflowHelper,
                           ReferenceResolver, ReferenceCache
    pages/                 PageUpdater, PageHelper (pages, snippets)
    domainModels/          AssociationUpdater, associationRename, sharedNames
    references/            ReferenceUpdater (generic qualified-name rewrite)
    documents/             DocumentUpdater with an inspector per type: workflows, mappings, JSON structures
    refresh/               RefreshUpdater (extra save of pages and snippets)
    shared/                elementWalker, qualifiedNameRewrite, variableRewrite, renameDocument
    StubUpdater.ts         placeholder for document types not implemented yet
src/UnitTests/             mirrors src/; helpers/ holds fakes and model builders
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
| Message definitions | Names | Not implemented (stub updater) |
| Document templates | Names and parameters | Not implemented (stub updater) |
| Datasets | Names and parameters | Not implemented (stub updater) |
| Java and JavaScript actions (model side) | Names, and entity types in parameters and return types (not in the reference pass) | Not implemented: `javaActions` and `javaScriptActions` are in the API |
| Consumed REST and OData services | Entity references (not in the reference pass) | Not implemented: in the API |
| Consumed REST and imported web services | References to renamed import/export mappings and JSON structures | Not implemented: not in the reference pass |
| ML model mappings | Entity references (not in the reference pass) | Not implemented: `mlMappingDocuments` is in the API |
| View entity source documents (OQL) | The entity name in OQL queries | Not implemented: `viewEntitySourceDocuments` is in the API. |
| Published REST, OData and web services | Document names and exposed names (references inside are updated) | By design: exposed names are an external contract |
| Marketplace modules and System | Everything | By design: Marketplace content is read-only |
