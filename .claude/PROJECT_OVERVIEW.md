# BGS-UtilityTools: Project Overview

## 1. What this is

BGS-UtilityTools is a **Mendix Studio Pro web extension** written in TypeScript on `@mendix/extensions-api` (`0.11.2-mendix.11.12.2`, beta). Studio Pro hosts it in an embedded browser (WebView2), where it can read and change the open app model.

It is meant to grow into a toolbox (`ToDo.md`):

| #   | Tool                                                                                                                     | Status                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1   | **NameChanger**: rename an entity and everything named after it                                                          | Built      |
| 2   | **PreFixer**: rename or remove a document prefix per document type, with every reference (§11)                           | Built        |
| 3   | **ClassSearcher**: find the elements that use a CSS class, shown as a tree (§12). Removing and adding classes come later | Search built, further updated planned |

Tool names are one PascalCase word that says what the tool does (NameChanger, PreFixer, ClassSearcher). The same name is the pane title, the menu caption and the `src/` folder.

### The problem the NameChanger solves

Renaming an entity, say `Order` to `Purchase`, leaves every derived name behind: `ACT_Order_Save`, `$OrderList`, page parameters, associations such as `Order_Customer`. The NameChanger renames those too.

Studio Pro also updates **no references at all** when something is renamed through the API, not even to the entity itself. So the tool records every rename it makes and rewrites every reference to it.

---

## 2. Architecture

```
Studio Pro
 ├─ loads dist/BGS-UtilityTools/manifest.json
 │
 ├─ main.js  (src/main.ts), runs at startup
 │    ├─ registers the dockable panes "NameChanger", "PreFixer" and "ClassSearcher"
 │    ├─ Extensions ▸ BGS-UtilityTools ▸ NameChanger / PreFixer / ClassSearcher → opens that pane
 │    └─ "Rename entity…" on domain models (App Explorer + editor) → opens the pane with that module selected
 │         (NameChanger/contextMenu.ts; the module reaches the pane via messagePassing, paneMessages.ts)
 │
 ├─ prefixerpane.js  (src/PreFixer/main.ts), the PreFixer pane (§11)
 │
 ├─ classsearcherpane.js  (src/ClassSearcher/main.ts), the ClassSearcher pane (§12)
 │
 └─ namechangerpane.js  (src/NameChanger/main.ts), runs inside the pane
      ├─ main.ts                   wiring only: Studio Pro APIs in, view and controller out
      ├─ ui/pane.html, PaneView.ts the DOM, built on the BGS-UtilityTools design system (src/shared/design)
      ├─ NameChangerPane.ts        controller without the DOM: load, pick, preselect, validate, rename, report
      ├─ moduleModel.ts            modules and entities for the pickers; skips Marketplace modules and System
      ├─ renameService.ts          builds the context, updaters and report for one rename and runs the job
      ├─ framework/                the entity rename job: steps, plans, report
      ├─ updaters/                 one updater per document type and phase; updaterRegistry.ts wires them
      └─ ui/runLog.ts              turns the report into the run log
```

**Shared code** (`src/shared`), used by the tools:

- `shared/rename/`: the generic rename job. Runner (`RenameJob.ts`: `runJob`, stages, batches), `JobScope`, `JobReport`, `QualifiedNameRenames`, `DocumentNameRegistry`, `ReferenceIndex`, `ReferenceUpdater` and `createReferenceUpdaters`, `existingReferences` (one save per unit), `JobTimings`, `UnitInfoCache`, `loadInScope`, run log groups, reserved names, Marketplace modules, and `rewrite/` (walker, with `walkElementsWithPath` for the ancestors; qualified-name rewrite). The ClassSearcher reuses `loadInScope`, `UnitInfoCache`, the Marketplace modules and the walker, read-only.
- `shared/design/`: the design system code. Styles, `mountPane` (fills the `[data-bgs-mark]`, `[data-bgs-runlog]` and `[data-bgs-footer]` slots), `RunLogView` with `runLog.html` and the run log model, `TreeView` with the tree model (`tree.ts`), `footer.html` (the credits), `forms.ts` (selects, status messages), theme, DOM helpers.
- Every pane: the header reads `BGS-UtilityTools - ToolName` next to the BGS mark (the product name in `bgs-pane-title__product`), and the credits footer ends the pane.

**Pane behaviour:**

- Before a run, both rename tools ask a Studio Pro confirmation (`ui.messageBoxes.ask`, warning) that ends with the shared commit warning (`shared/design/confirm.ts`). The pane is busy from the question on, so a second submit can't ask again.
- After a successful rename, the entity is renamed in the loaded list (no reload), and both pickers are reset to empty.
- A context-menu preselect reloads the entities first, so new entities are listed.
- Clicking a run log row opens that document (`ui.editors.editDocument`).

---

## 3. Build and test

| Command             | What it does                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`     | `tsc --noEmit`, then esbuild (`build-extension.mjs`). Copies the manifest to `dist/` and the build to `<appDir>/extensions/BGS-UtilityTools` (`build.helpers.mjs`). |
| `npm run build:dev` | Same, in watch mode.                                                                                                                                                |
| `npm test`          | Vitest unit tests (`src/UnitTests/**`, node environment). Plain-object fakes and builders; Studio Pro is never loaded.                                              |

- `.html`, `.css` and `.svg` are imported as plain strings (esbuild `text` loader) and injected at runtime.
- **Real testing needs Studio Pro.** `.vscode/launch.json` starts it with `--enable-extension-development --enable-web-extensions` and attaches the debugger to the WebView.

---

## 4. The rename job

`renameService.runEntityRename` builds a `RenameContext` and the updaters (`updaters/updaterRegistry.ts`, the only place that touches `app.model`). It then runs `framework/EntityRenameJob.ts` in Studio Pro's progress dialog, on the shared runner (`shared/rename/RenameJob.ts`).

- Each step lists its units with `getUnitsInfo` and skips Marketplace modules and System.
- Units are loaded in batches of 100 (`shared/rename/RenamePlanner.ts`). Each step drops units it has no work for (`accepts`) before batching, so batches are full.
- API calls run one after another, never in parallel (lead decision).

| Phase          | What it does                                                                                                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prepare**    | Checks the entity can be renamed, collects every document name per module (`DocumentNameRegistry`) and counts document templates for a warning. Changes nothing.                                                                                                                                      |
| **Plan**       | Read-only, and the only phase that calls `resolve()`. Every updater decides which documents, parameters, variables and associations get a new name, and records each rename in `QualifiedNameRenames` (old → new qualified name). An error here stops the job before anything changes.                |
| **Entity**     | `EntityRenameStep` renames the entity and the planned associations in its own domain model, and rewrites that domain model's references, in one save.                                                                                                                                                 |
| **Rename**     | Applies the plan: associations in other modules, Java and JavaScript actions, then flows, pages and other documents, with their parameters, variables and every expression that uses them. Loads only units with planned work. Flows also rewrite references to names that exist already (see below). |
| **References** | `ReferenceUpdater` rewrites every renamed qualified name in each document type of `REFERENCE_DOCUMENT_TYPES`. Skips units the plan phase read that reference nothing renamed, and flows the rename phase saved up to date.                                                                            |
| **Refresh**    | Saves changed pages and snippets that call a flow or page with renamed parameters once more, so Studio Pro drops stale consistency errors (CE0115/CE0117).                                                                                                                                            |

### Loading and saving as little as possible

Nearly all of a rename's time is Studio Pro API calls. The lead's timings (89 s run) showed `loadAll` costs ~0.5 s per call whatever its size, and `save` ~0.11 s per unit; resolving, listing and our own code were a few seconds together. The fixes below brought that run down by ~10 s.

- **Full batches:** units without work are left out before batching, so a step that changes 99 flows makes one `loadAll` call, not 19.
- **One save per flow:** every rename key records the unit declaring it (`QualifiedNameRenames` owners). A new name exists once that unit was saved in this job (`savedInJob`). A flow's rename save also rewrites references to names that exist already; references to names saved later keep their old name, which still exists, until the reference pass. A flow left with no renamed reference is marked up to date (`ReferenceIndex.markUpToDate`) and skipped by the reference pass, unless its save failed.
- **Fewer refreshes:** only changed pages and snippets that referenced a document with renamed parameters (`parameterOwnerPrefixes`).
- **Rename phase:** a planner marks a unit in `DocumentRenamePlan` when it has a rename, a skipped rename (so the Skipped count stays right) or another change: a return variable, workflow texts, or published exposed names with the opt-in. Only units for which `needsRename` is true are loaded. The check runs when the batch runs, so a late forced or revoked rename from `sharedNames.ts` still counts.
- **Reference pass:** every unit the plan phase loads is indexed by the `Module.Name` prefixes of its dotted names (`framework/ReferenceIndex.ts`, same walker and regex as the rewrite). An indexed unit is loaded only when one of its prefixes matches a renamed name. Types without a planner have no index entry and are always loaded: view entity sources, layouts, menus, scheduled events, consumed services, ML mappings, database connections, Excel templates, connector types, business event and CDC services.
- **From metadata:** JSON structures and view entity sources are planned from their name alone (`updateFromInfo`), without loading.
- **Resolver cache:** units loaded while planning seed `ReferenceResolver` (flow return entities, Java/JS signatures, workflow context entities), so most callees need no `resolve()`. That's why Java actions, JavaScript actions and workflows are planned before flows. Callees are always resolved by the name the caller writes, never by a planned new name.

### Why the order matters

Studio Pro checks a document only when it is saved, and never re-checks it when a name it refers to appears later. So every document gets its last save after everything it references exists.

The reference pass runs in this order:

1. view entity queries
2. domain models
3. Java and JavaScript actions, connector types, consumed REST and OData services, ML model mappings, database connections and Excel importer templates (these define the types their callers get)
4. microflows, nanoflows, rules, pages and the rest
5. published services, business event services and change data capture services

### Allow-lists

Documents that hold text mirroring something external get an `onlyProperties` allow-list, so only reference properties are rewritten. That covers consumed services, ML model mappings, database connections, Excel templates, connector types, business event services and change data capture services. OpenAPI and OData metadata, AsyncAPI, exposed names, tensor names, SQL and connection settings are never touched.

### Naming rules (`framework/NamingPolicy.ts`)

- **Exact case:** names are matched exact-case, and every occurrence is replaced (`ACT_Orders_Get` → `ACT_Purchases_Get`).
- **Other entities are protected:** renaming `Order` leaves `OrderLine` alone.
- **Taken names:** a rename onto a name that already exists is skipped and counted.
- **Shared names:** a document and an association with the same qualified name both get the new name, or neither does (`sharedNames.ts`).

### Result

`framework/RenameReport.ts` (a `JobReport` plus the entity) collects what changed, was skipped or failed. `ui/runLog.ts` shows it grouped as Entity, Failed, Renamed, Updated, Skipped, Navigation, Message definitions, Code and reports, and Timings.

**Timings** (`shared/rename/JobTimings.ts`): `instrumentModel` wraps `app.model` so every API call is timed per progress step. The folded Timings group shows the dialog total, the time between steps, the API calls over all steps, and each step slowest first (calls, units, and "other": time outside API calls). Its rows have the `info` tone: never counted, hidden by "Only problems".

The run log warns when:

- navigation may point to renamed pages, microflows or nanoflows
- a changed message definition is used by import or export mappings; it lists only the mappings of definitions that expose the entity (`MessageDefinitionUsage`)
- Java or JavaScript actions changed (their code is not updated)
- datasets were renamed (report widgets are not updated)
- published services got renamed exposed names (API clients must be updated)
- the app has document templates (never updated)

---

## 5. What is handled

| Document type                                                   | Renamed when it uses the entity and has its name in its name                          | References updated | Kept by design                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------ | -------------------------------- |
| Domain models                                                   | The entity; associations named after it, cross-module included                        | ✓                  | Other entities                   |
| View entity source documents                                    | Only the renamed view entity's own source                                             | ✓ (OQL)            | Other view entities' names       |
| Microflows, nanoflows, rules                                    | Document, parameters, variables (see below)                                           | ✓                  |                                  |
| Pages, snippets                                                 | Document, parameters                                                                  | ✓                  |                                  |
| Workflows                                                       | Document, parameter, entity name in texts                                             | ✓                  |                                  |
| Import and export mappings                                      | Document, export mapping parameter                                                    | ✓                  |                                  |
| JSON structures                                                 | Only when an entity mapping uses it                                                   |                    |                                  |
| Message definitions                                             | Collection definitions, documents                                                     | ✓                  | Exposed names                    |
| Datasets                                                        | Document, parameters                                                                  | ✓                  |                                  |
| Java and JavaScript actions                                     | Document, parameters                                                                  | ✓                  | Action code                      |
| Published REST, OData and web services                          | Document; exposed names and REST `{Param}` placeholders only with the opt-in checkbox | ✓                  | Path text, namespaces, versions  |
| Layouts, menus, scheduled events                                |                                                                                       | ✓                  | Names                            |
| Consumed REST and OData services                                |                                                                                       | ✓ allow-list       | Names                            |
| ML model mappings                                               |                                                                                       | ✓ allow-list       | Names (mirror the model file)    |
| Database connections, Excel importer templates, connector types |                                                                                       | ✓ allow-list       | Names (lead decision)            |
| Business event and change data capture services                 |                                                                                       | ✓ allow-list       | Names, message and exposed names |

**Variables renamed in flows:** variables of the entity's type with its name in their name, from:

- parameters, loop iterators, the return variable
- create object, create list and create variable
- retrieve (database and association), list operations, cast
- microflow, nanoflow, Java and JavaScript action calls
- REST, web service, external action, ML model and import mapping calls
- get workflow data
- execute database query, import Excel data and connector action calls

Every expression that uses them is rewritten too.

**Not in the API's `MicroflowAction` union:** execute database query, import Excel data and connector action call. `MicroflowHelper` handles them separately.

---

## 6. Not handled: manual checks

The pane's "What you need to check yourself" lists the same items. Causes:

- **API restriction:** the API can't read or change it.
- **By design:** left alone on purpose.
- **Studio Pro behaviour:** Studio Pro itself blocks or undoes it.
- **Not implemented:** possible, not built.

| Item                                                       | What is not updated                                                                       | Cause                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Navigation (menu items, home pages, login page)            | References to renamed pages, microflows, nanoflows                                        | API restriction. Run log warns.                                               |
| Java and JavaScript action code                            | Old entity, class, action and parameter names in code                                     | API restriction (`app.files` could, but risky). Run log warns.                |
| Report widgets                                             | References to renamed datasets                                                            | API restriction. Run log warns.                                               |
| App Security demo users                                    | Their user entity                                                                         | API restriction: project security is not in the API.                          |
| Import and export mappings of a changed message definition | Their mapping no longer matches; updating it in Studio Pro clears it                      | Studio Pro behaviour. Run log lists them.                                     |
| Clients of published services                              | Renamed exposed names (opt-in only)                                                       | By design. Run log warns.                                                     |
| Document templates                                         | Everything: names, parameters, references                                                 | By design: deprecated, and updating them failed. Never loaded; run log warns. |
| Imported web services                                      | Nothing: they reference no entities or app documents                                      | By design                                                                     |
| Enumerations, constants, page templates, building blocks   | Names                                                                                     | By design (`EXCLUDED_DOCUMENT_TYPES`)                                         |
| Connector action calls                                     | Renamed Java action parameters, unless stored as `Module.Action.Parameter` (then updated) | Not implemented, UNVERIFIED                                                   |
| Marketplace modules and System                             | Everything                                                                                | By design: read-only                                                          |

Checked and not relevant (no entity references): image and icon collections, regular expressions, XML schemas, module settings and security, queues, data transformers, authentications.

---

## 7. Studio Pro behaviour and limitations

**Confirmed behaviour:**

- **No reference is ever updated by Studio Pro** after a rename through the API; the tool rewrites them all.
- **Documents are checked only on save.** Hence the phase order, the reference order and the refresh pass.
- **The typings don't always match runtime.** Rules have no `parameters` list, and nanoflows hold their parameters only in the object collection. Code guards against missing properties.
- **`getModulesTree()` keeps old names** of documents renamed through the API (PreFixer testing, 2026-11-02). The PreFixer puts its session's renames over every tree read (`shared/rename/RenamedDocumentNames.ts`). The NameChanger still reads the tree as it is (document name checks in Preparing). UNVERIFIED: when the tree catches up.
- **`loadAll` loads 10 units by default.** The job always passes the count it wants.
- **API cost (lead's timings):** `loadAll` ~0.5 s per call regardless of units, `save` ~0.11 s per unit, `resolve` and `getUnitsInfo` a few ms. Fewer calls matter more than fewer units.
- **Clicking a run log row works:** `editDocument` accepts the unit `$ID`.
- **A changed message definition breaks its mappings,** and updating them in Studio Pro clears them.

**Limitations:**

- **A failed run can't be repaired by rerunning.** The entity is renamed before the documents, and the rename map is not stored; fix the listed failures by hand or revert through version control.
- **The context menu can't know the clicked entity.** It only gets `{ documentId }`, so it preselects the module and the entity is picked in the pane.
- **Java/JS code, navigation, report widgets and App Security** are out of reach (§6).

---

## 8. Open assumptions

Marked `UNVERIFIED:` in the code, and to be confirmed in Studio Pro.

**Model shape:**

- Element proxies enumerate their properties with `Object.keys`; the generic walker depends on this (`shared/rename/rewrite/elementWalker.ts`).
- Association `parent`/`child` may be an `$ID` or a qualified name; both are checked.
- Sequence flow origins are object `$ID`s, and flows inside loops are also in `flow.flows`.
- Which of a microflow's two parameter lists is leading; both are kept in sync.
- Rule parameters are parameter objects like microflow parameters (`FlowUpdater.ts`).
- `messageDefinitions2` exists at runtime; a listing failure stops the job.

**Reference formats:**

- `PageVariable.pageParameter` is bare or `Module.Page.Param`; page URL and published REST path placeholders are `{Param}` (`PageHelper.ts`, `urlPlaceholders.ts`).
- Java/JS action parameter mappings are `Module.Action.Param`; bare names are not rewritten (`CodeActionInspector.ts`).
- REST operations are referenced as `Module.Service.Operation`, database queries as `Module.Connection.Query`, Excel templates as `Module.Template`, connector actions as `Module.ConnectorType.Action` (`ReferenceResolver.ts`).
- Message definitions inside a collection are referenced as `Module.Collection.Definition` (`MessageDefinitionInspector.ts`, `MessageDefinitionUsage.ts`).
- These attribute fields hold `Module.Entity.Attribute`: ML mappings, database connection columns, Excel template columns, change data capture properties.
- `resolve()` works on elements that are not units (associations).

**Behaviour:**

- Which email fields are expressions, and whether an attachment is a bare variable name.
- `ExecuteDatabaseQueryAction.dynamicQuery` and its parameter values are expressions. The three module actions appear as `ActionActivity.action`.
- A database query or Excel import returns a list of its single mapped entity.
- Dataset queries use parameters as `$Name`, and parameter access holds the bare name (`DataSetInspector.ts`).
- The workflow parameter can be renamed, and an export mapping's `parameterName` is not referenced elsewhere.
- Consumed REST mapping trees hold qualified names only in the allow-listed properties.
- OData `EntitySet.entityType` refers to the entity, not an exposed name. Exposed names are unique per property within a service.
- Saving an ML mapping with a rewritten entity keeps its tensor mappings.
- A view entity's source document has the view entity's name, a view entity can be renamed through the API, and pointing to the old source name for one save causes no stale error.
- View entity OQL with double-quoted identifiers or comments is untested.
- A flow whose last save is in the rename phase (before domain models get their reference save) shows no stale error; pages left out of the refresh show none either.
- Model API methods still work through the timing wrapper (`instrumentModel`).
- What Studio Pro does with the `.java`/`.js` file when an action is renamed.
- Context menu:
  - its `documentId` is the domain model's unit `$ID`
  - `"DomainModels$DomainModel"` is a valid menu document type
  - a closed pane loads only when opened (handled by a `paneReady` handshake)

---

## 9. The extensions API in short

- **Entry points:** each exports `component: IComponent` with `loaded(context)`. `getStudioProApi(context)` gives the API. `src/manifest.json` names the `main` script and the UI entry points.
- **Used here:**
  - `app.model.*`
  - `ui.panes`, `ui.extensionsMenu`, `ui.appExplorer`/`ui.documents` (context menus)
  - `ui.dialogs` (progress dialog), `ui.editors`, `ui.preferences`, `ui.messagePassing`, `ui.messageBoxes` (confirmation before a run)
- **Units and elements:** units are documents that load on their own (domain model, microflow, page); elements live inside them.
  - `getUnitsInfo()` is cheap metadata.
  - `loadAll(filter, max)` loads units; **max defaults to 10**.
  - `load`/`resolve` fetch one unit or element.
  - `projects.getModulesTree()` lists modules, folders and documents.
- **Typed proxies:** every object has `$Type` (e.g. `"Microflows$RetrieveAction"`) and `$ID`; `switch` on `$Type` narrows the type.
- **References are strings:** qualified names such as `"MyModule.Order"` (`shared/rename/rewrite/qualifiedNameRewrite.ts`).
- **Expressions are strings:** XPath and microflow expressions too (`NameChanger/updaters/shared/variableRewrite.ts`, which skips quoted literals).
- **Writing:** set properties, then `await save(unit)`.

---

## 10. Repo map

```
build-extension.mjs        esbuild entry points and deploy target (appDir)
build.helpers.mjs          esbuild config, copy-manifest and copy-to-app plugins
vitest.config.ts           unit test config
ToDo.md                    roadmap
src/manifest.json          main script and UI entry points (namechangerpane, prefixerpane, classsearcherpane)
src/main.ts                panes, Extensions menu, domain model context menus
src/global.d.ts            .html/.css/.svg imports as strings
src/shared/design/         BGS-UtilityTools design system: tokens.css, bundle.css (incl. run log and tree), bgs-mark.svg,
                           theme, pane mount, DOM helpers, status, forms, runLog (model), RunLogView + runLog.html,
                           tree (model), TreeView, footer.html
src/shared/rename/         generic rename job: RenameJob (runner, stages), RenamePlanner (batches), JobScope,
                           JobReport, QualifiedNameRenames, DocumentNameRegistry, ReferenceIndex, ReferenceUpdater,
                           referenceTypes, existingReferences, JobTimings, UnitInfoCache, loadInScope,
                           runLogGroups, names, modules, types
  rewrite/                 elementWalker (walkElements, walkElementsWithPath), qualifiedNameRewrite
src/ClassSearcher/         §12
  main.ts                  pane entry point (wiring only)
  ClassSearcherPane.ts     pane controller
  documentKinds.ts         the searched document types
  validation.ts            class name input
  openTarget.ts            opens a result row in Studio Pro
  search/                  classTokens (Class field and expression literals), structure (parent widget and labels),
                           findClassUsages (one document), classSearch (all documents in scope)
  results/                 resultTree (matches → TreeNodes)
  ui/                      pane.html, PaneView.ts (DOM)
src/PreFixer/              §11
  main.ts                  pane entry point (wiring only)
  PreFixerPane.ts          pane controller
  prefixModel.ts           modules tree → documents and prefixes per type group
  prefixRename.ts          prefix rule, new names, name checks
  validation.ts            new prefix and request checks
  documentTypes.ts         renamable types, groups, risks
  referenceTypes.ts        the PreFixer's reference pass and allow-lists
  prefixService.ts         builds and runs one prefix job
  framework/               PrefixPrepareStep, MarketplaceScanStep, PrefixPlanStep, prefixPlanner, PrefixPlan,
                           RenameCheckStep, PrefixJobState, domainNames
  updaters/                DocumentRenamer, updaterRegistry
  ui/                      pane.html, PaneView.ts (DOM), runLog.ts (report → run log)
src/NameChanger/
  main.ts                  pane entry point (wiring only)
  NameChangerPane.ts       pane controller
  contextMenu.ts           "Rename entity…" on domain models
  paneMessages.ts          main ↔ pane messages (module preselect, paneReady handshake)
  entityPicker.ts          entity options for the pickers
  moduleModel.ts           loading modules and entities
  validation.ts            request and name checks
  renameService.ts         builds and runs one rename job
  ui/                      pane.html, PaneView.ts (DOM), runLog.ts (report → run log)
  framework/               EntityRenameJob, RenameContext, PrepareStep, EntityRenameStep, NamingPolicy,
                           DocumentRenamePlan, AssociationRenamePlan, RenameReport, MessageDefinitionUsage
  updaters/
    updaterRegistry.ts     every updater per phase, REFERENCE_DOCUMENT_TYPES, EXCLUDED_DOCUMENT_TYPES
    microflows/            FlowUpdater (microflows, nanoflows, rules), MicroflowHelper, ReferenceResolver,
                           ReferenceCache
    pages/                 PageUpdater, PageHelper (pages, snippets)
    domainModels/          AssociationUpdater, associationRename, sharedNames
    documents/             DocumentUpdater + an inspector per type: workflows, mappings, JSON structures,
                           message definitions, datasets, view entity sources, Java/JS actions, published services
    refresh/               RefreshUpdater (extra save of pages and snippets)
    shared/                variableRewrite, urlPlaceholders, renameDocument
src/UnitTests/             mirrors src/; shared/helpers/ holds the generic fakes, NameChanger/helpers/ the
                           entity context, builders and FakeMessaging, PreFixer/helpers/ the tree and model fakes,
                           ClassSearcher/helpers/ the builders for elements with a Class field
```

### Machine-specific paths

- `appDir` in `build-extension.mjs` points to a Mendix app on this machine. If it doesn't exist, the build doesn't deploy.
- `.vscode/launch.json` points to `C:\Users\Thom\Mendix\...` and Studio Pro 11.12.2. Reading both from an environment variable or a local config would help.

---

## 11. The PreFixer

A pane (Extensions ▸ BGS-UtilityTools ▸ PreFixer) that renames or removes a document prefix across the app's own modules, and rewrites every reference to the renamed documents.

**The prefix rule (lead):**

- 1–4 capital letters A–Z before the first `_`, with something after it. `ACT_Order_Save` and `ACT_Save` have `ACT`; `Act_Order_Save`, `V2_Order_Save` and `ACT_` have none.
- A prefix belongs to one type group. Microflows and nanoflows share a group; every other document type is its own. `ACT_` on flows and on pages are separate dropdown entries.
- The new prefix follows the same rule; the input is uppercased as it is typed. "Remove prefix" turns `ACT_Order_Save` into `Order_Save`.

**Pane:** a grouped dropdown (`ACT_ (123)` under "Microflows & nanoflows"), the new prefix, "Remove prefix", an example line, then a Studio Pro confirmation (`ui.messageBoxes.ask`) before the run. After a run with changes, the prefixes are reloaded and the form is reset.

### The job (`prefixService.runPrefixRename`)

| Step                             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Preparing**                    | `getModulesTree()`, with this session's renames put over it (`RenamedDocumentNames`, filled after every run) → document names (`DocumentNameRegistry`), the candidates (chosen group, old prefix, own modules), the Marketplace modules and the document template count. Loads own domain models and module security for entity, association and module role names. Lists every model API the job uses, so a listing failure stops the job before anything changes.                                                                                                                                                                                               |
| **Checking Marketplace modules** | Read-only, never saves. Loads the Marketplace modules' documents of the reference types and records which candidates they reference.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Planning renames**             | Metadata only, no API calls. Per candidate, the first reason that applies skips it: not listed by its API, invalid or reserved new name, old or new name equal to an entity, association or module role, used by a Marketplace document, new name existed at the start or is taken in any case. Otherwise the rename is planned and recorded in `QualifiedNameRenames`. The start-name check means renames never chain.                                                                                                                                                                                                                                           |
| **Renaming …**                   | One `DocumentRenamer` step per type of the group. Sets the name and, for types in the reference pass, rewrites references to renames that exist already, its own included, in the same save. Load failures fail their units and the job goes on.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Checking renames**             | A planned rename that wasn't saved is dropped from `QualifiedNameRenames`, so references keep the old name, which still exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Updating references in …**     | `PREFIX_REFERENCE_DOCUMENT_TYPES` (`referenceTypes.ts`): enumerations, domain models, Java/JS actions, connector types, connectors, authentications, consumed services, imported web services, database connections, flows, pages, snippets, layouts, page templates, building blocks, menus, workflows, mappings, message definitions, datasets, scheduled events, task queues, published services, business event services. Allow-lists add constant fields (connection strings, proxy settings, credentials, `Rest$ConstantValue.value`); a `Type$Element.key` entry limits a key to one element type. Units saved up to date in the rename phase are skipped. |

No refresh pass: no parameters are renamed. When the run stops after documents were renamed, the report is marked incomplete.

**Run log:** Failed, Skipped (one row per document with the reason), Renamed, Updated, Check yourself, Timings. "Check yourself" has a row per risk of the renamed types (`documentTypes.ts`): navigation, app settings, constant values in configurations and the Portal, action code, Java proxies, report widgets, scheduled events, running workflows, queued tasks, theme images, API clients, and document templates.

### Not handled (manual checks)

Navigation, App Settings (after startup, before shutdown, health check, workflow settings), constant values per configuration and in Portal environments, Java/JS code and Java proxies, report widgets, Portal scheduled event settings, workflow instances and queued tasks in deployed environments, theme style paths to images, and published service clients. Marketplace modules and System are never changed; view entity sources, document templates and custom blob documents are never renamed.

### Open assumptions (UNVERIFIED, in the code)

- `getModulesTree()` documents carry the same `$ID`/`$Type` as `getUnitsInfo()`, and modules carry `fromAppStore`.
- `name` + `save` renames every type in `RENAMABLE_DOCUMENT_TYPES`; untested so far for constants, enumerations, image and icon collections, menus, queues, scheduled events, connectors, authentications and consumed services.
- Document names follow the entity name rules, are unique case-insensitively within a module across types, and the reserved words apply.
- Every reference is a qualified-name string: `@Module.Constant`, `Module.Enum.Value`, `Module.Collection.Image`, pluggable widget properties, and each new allow-list field.
- No stale consistency errors after a run without a refresh pass; a unit whose last save is in the rename phase is fine.
- A second `uiEntrypoint` (`prefixerpane`) loads its own bundle; `messageBoxes.ask` works from a pane; `editDocument` opens every document type.
- What Studio Pro does with the code file of a renamed Java or JavaScript action.

---

## 12. The ClassSearcher

A pane (Extensions ▸ BGS-UtilityTools ▸ ClassSearcher) that finds every element using one CSS class and shows the results as a tree. It only reads the app: no confirmation, no progress dialog; the pane is busy while a search runs.

**Search rules (lead, 2026-11-06):**

- **Exact and case-sensitive**, like CSS: `card` doesn't find `card--highlight` or `Card`. One class per search; a leading `.` is dropped.
- **Class field** (`appearance.class`): split on whitespace.
- **Dynamic classes** (`appearance.dynamicClasses`, an expression): only the classes inside its `'…'` string literals. A class built from parts (`'card--' + $Status`) can't be found.
- **Scope:** pages, snippets, layouts, building blocks and page templates in the app's own modules (`documentKinds.ts`). Marketplace modules and System are skipped.
- Every search loads the documents fresh (`loadInScope`, batches of 100), so edits since the last search are seen.

**Results (lead, 2026-11-06):** three levels, document › parent widget › element holding the class (`results/resultTree.ts`, `search/structure.ts`):

- One root per document, sorted by qualified name, with its match count. A document's own Class field shows on its row.
- The parent is the nearest **named widget** above the element: a widget with a Class field and a name. Layout grid rows and columns, placeholders, tab pages and pluggable widget slots are skipped. An element without one sits right under the document.
- Parents come in the order of their first result; parent rows show name and type only. A widget that holds the class and is a parent shows in both places.
- Elements with a Class field but no name are labelled by kind and position: "Row 2", "Column 1", "Cell 3", "Item 1", "Left region".
- A document row's chevron opens everything below it; a parent's chevron opens one level.

A matching row shows its fields ("Class", "Dynamic") with the class marked. Every row keeps the element `$ID` (`RowTarget`), so removing or adding classes can build on it. Clicking a document row opens it; clicking an element row opens its document and focuses the element (`openTarget.ts`), or only opens the document when focusing fails.

### Not found (the pane's "What isn't found")

Classes built from parts in an expression, classes added by design properties, classes in pluggable widget properties (such as a Data grid 2 dynamic cell class), Marketplace modules and System, and classes in theme SCSS or JavaScript.

### Open assumptions (UNVERIFIED, in the code)

- A third `uiEntrypoint` (`classsearcherpane`) loads its own bundle.
- `getUnitsInfo`/`loadAll` work on `layouts`, `buildingBlocks` and `pageTemplates`, with unit types `Pages$Layout`, `Pages$BuildingBlock` and `Pages$PageTemplate` (first use in this project).
- Page element proxies, including a pluggable widget's `object.properties`, enumerate with `Object.keys` (the walker).
- `editDocument(document, { id })` focuses a page widget; so far only used for entities.
- How Mendix escapes a quote inside an expression string literal; both `''` and `\'` are read as one.
