# BGS-UtilityTools: Project Overview

## 1. What this is

BGS-UtilityTools is a **Mendix Studio Pro web extension** written in TypeScript on `@mendix/extensions-api` (`0.11.4-mendix.11.12.4`, beta). Studio Pro hosts it in an embedded browser (WebView2), where it can read and change the open app model.

It is meant to grow into a toolbox (`ToDo.md`):

| # | Tool | Status |
|---|---|---|
| 1 | **Entity Name Changer**: rename an entity and everything named after it | Built, being tested in Studio Pro |
| 2 | Prefix updater: list naming prefixes and bulk-rename them | Planned |
| 3 | CSS class searcher: find, add or remove CSS classes across pages | Planned |
| 4 | Microflow color palette: color action activities based on markers | Planned |

### The problem the Entity Name Changer solves

Renaming an entity, say `Order` to `Purchase`, leaves every derived name behind: `ACT_Order_Save`, `$OrderList`, page parameters, associations such as `Order_Customer`. The Entity Name Changer renames those too.

Studio Pro also updates **no references at all** when something is renamed through the API, not even to the entity itself. So the tool records every rename it makes and rewrites every reference to it.

---

## 2. Architecture

```
Studio Pro
 ├─ loads dist/BGS-UtilityTools/manifest.json
 │
 ├─ main.js  (src/main.ts), runs at startup
 │    ├─ registers the dockable pane "Entity Name Changer"
 │    ├─ Extensions ▸ BGS-UtilityTools ▸ Entity Name Changer → opens the pane
 │    └─ "Rename entity…" on domain models (App Explorer + editor) → opens the pane with that module selected
 │         (EntityNameChanger/contextMenu.ts; the module reaches the pane via messagePassing, paneMessages.ts)
 │
 └─ dockablepane.js  (src/EntityNameChanger/main.ts), runs inside the pane
      ├─ main.ts                   wiring only: Studio Pro APIs in, view and controller out
      ├─ ui/pane.html, PaneView.ts the DOM, built on the BGS-UtilityTools design system (src/shared/design)
      ├─ EntityNameChangerPane.ts  controller without the DOM: load, pick, preselect, validate, rename, report
      ├─ moduleModel.ts            modules and entities for the pickers; skips Marketplace modules and System
      ├─ renameService.ts          builds the context, updaters and report for one rename and runs the job
      ├─ framework/                the rename job: steps, plans, rename map, report
      ├─ updaters/                 one updater per document type and phase; updaterRegistry.ts wires them
      └─ ui/runLog.ts              turns the report into the run log
```

**Pane behaviour:**
- After a successful rename, the entity is renamed in the loaded list (no reload), and both pickers are reset to empty.
- A context-menu preselect reloads the entities first, so new entities are listed.
- Clicking a run log row opens that document (`ui.editors.editDocument`).

---

## 3. Build and test

| Command | What it does |
|---|---|
| `npm run build` | `tsc --noEmit`, then esbuild (`build-extension.mjs`). Copies the manifest to `dist/` and the build to `<appDir>/extensions/BGS-UtilityTools` (`build.helpers.mjs`). |
| `npm run build:dev` | Same, in watch mode. |
| `npm test` | Vitest unit tests (`src/UnitTests/**`, node environment). Plain-object fakes and builders; Studio Pro is never loaded. |

- `.html`, `.css` and `.svg` are imported as plain strings (esbuild `text` loader) and injected at runtime.
- **Real testing needs Studio Pro.** `.vscode/launch.json` starts it with `--enable-extension-development --enable-web-extensions` and attaches the debugger to the WebView.

---

## 4. The rename job

`renameService.runEntityRename` builds a `RenameContext` and the updaters (`updaters/updaterRegistry.ts`, the only place that touches `app.model`). It then runs `framework/RenameJob.ts` in Studio Pro's progress dialog.
- Each step lists its units with `getUnitsInfo` and skips Marketplace modules and System.
- Units are loaded in batches of 100 (`RenamePlanner.ts`). Each step drops units it has no work for (`accepts`) before batching, so batches are full.
- API calls run one after another, never in parallel (lead decision).

| Phase | What it does |
|---|---|
| **Prepare** | Checks the entity can be renamed, collects every document name per module (`DocumentNameRegistry`) and counts document templates for a warning. Changes nothing. |
| **Plan** | Read-only, and the only phase that calls `resolve()`. Every updater decides which documents, parameters, variables and associations get a new name, and records each rename in `QualifiedNameRenames` (old → new qualified name). An error here stops the job before anything changes. |
| **Entity** | `EntityRenameStep` renames the entity and the planned associations in its own domain model, and rewrites that domain model's references, in one save. |
| **Rename** | Applies the plan: associations in other modules, Java and JavaScript actions, then flows, pages and other documents, with their parameters, variables and every expression that uses them. Loads only units with planned work. Flows also rewrite references to names that exist already (see below). |
| **References** | `ReferenceUpdater` rewrites every renamed qualified name in each document type of `REFERENCE_DOCUMENT_TYPES`. Skips units the plan phase read that reference nothing renamed, and flows the rename phase saved up to date. |
| **Refresh** | Saves changed pages and snippets that call a flow or page with renamed parameters once more, so Studio Pro drops stale consistency errors (CE0115/CE0117). |

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

`framework/RenameReport.ts` collects what changed, was skipped or failed. `ui/runLog.ts` shows it grouped as Entity, Failed, Renamed, Updated, Skipped, Navigation, Message definitions, Code and reports, and Timings.

**Timings** (`framework/JobTimings.ts`): `instrumentModel` wraps `app.model` so every API call is timed per progress step. The folded Timings group shows the dialog total, the time between steps, the API calls over all steps, and each step slowest first (calls, units, and "other": time outside API calls). Its rows have the `info` tone: never counted, hidden by "Only problems".

The run log warns when:
- navigation may point to renamed pages, microflows or nanoflows
- a changed message definition is used by import or export mappings; it lists only the mappings of definitions that expose the entity (`MessageDefinitionUsage`)
- Java or JavaScript actions changed (their code is not updated)
- datasets were renamed (report widgets are not updated)
- published services got renamed exposed names (API clients must be updated)
- the app has document templates (never updated)

---

## 5. What is handled

| Document type | Renamed when it uses the entity and has its name in its name | References updated | Kept by design |
|---|---|---|---|
| Domain models | The entity; associations named after it, cross-module included | ✓ | Other entities |
| View entity source documents | Only the renamed view entity's own source | ✓ (OQL) | Other view entities' names |
| Microflows, nanoflows, rules | Document, parameters, variables (see below) | ✓ | |
| Pages, snippets | Document, parameters | ✓ | |
| Workflows | Document, parameter, entity name in texts | ✓ | |
| Import and export mappings | Document, export mapping parameter | ✓ | |
| JSON structures | Only when an entity mapping uses it | | |
| Message definitions | Collection definitions, documents | ✓ | Exposed names |
| Datasets | Document, parameters | ✓ | |
| Java and JavaScript actions | Document, parameters | ✓ | Action code |
| Published REST, OData and web services | Document; exposed names and REST `{Param}` placeholders only with the opt-in checkbox | ✓ | Path text, namespaces, versions |
| Layouts, menus, scheduled events | | ✓ | Names |
| Consumed REST and OData services | | ✓ allow-list | Names |
| ML model mappings | | ✓ allow-list | Names (mirror the model file) |
| Database connections, Excel importer templates, connector types | | ✓ allow-list | Names (lead decision) |
| Business event and change data capture services | | ✓ allow-list | Names, message and exposed names |

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

| Item | What is not updated | Cause |
|---|---|---|
| Navigation (menu items, home pages, login page) | References to renamed pages, microflows, nanoflows | API restriction. Run log warns. |
| Java and JavaScript action code | Old entity, class, action and parameter names in code | API restriction (`app.files` could, but risky). Run log warns. |
| Report widgets | References to renamed datasets | API restriction. Run log warns. |
| App Security demo users | Their user entity | API restriction: project security is not in the API. |
| Import and export mappings of a changed message definition | Their mapping no longer matches; updating it in Studio Pro clears it | Studio Pro behaviour. Run log lists them. |
| Clients of published services | Renamed exposed names (opt-in only) | By design. Run log warns. |
| Document templates | Everything: names, parameters, references | By design: deprecated, and updating them failed. Never loaded; run log warns. |
| Imported web services | Nothing: they reference no entities or app documents | By design |
| Enumerations, constants, page templates, building blocks | Names | By design (`EXCLUDED_DOCUMENT_TYPES`) |
| Connector action calls | Renamed Java action parameters, unless stored as `Module.Action.Parameter` (then updated) | Not implemented, UNVERIFIED |
| Marketplace modules and System | Everything | By design: read-only |

Checked and not relevant (no entity references): image and icon collections, regular expressions, XML schemas, module settings and security, queues, data transformers, authentications.

---

## 7. Studio Pro behaviour and limitations

**Confirmed behaviour:**
- **No reference is ever updated by Studio Pro** after a rename through the API; the tool rewrites them all.
- **Documents are checked only on save.** Hence the phase order, the reference order and the refresh pass.
- **The typings don't always match runtime.** Rules have no `parameters` list, and nanoflows hold their parameters only in the object collection. Code guards against missing properties.
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
- Element proxies enumerate their properties with `Object.keys`; the generic walker depends on this (`elementWalker.ts`).
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
  - `ui.dialogs` (progress dialog), `ui.editors`, `ui.preferences`, `ui.messagePassing`
- **Units and elements:** units are documents that load on their own (domain model, microflow, page); elements live inside them.
  - `getUnitsInfo()` is cheap metadata.
  - `loadAll(filter, max)` loads units; **max defaults to 10**.
  - `load`/`resolve` fetch one unit or element.
  - `projects.getModulesTree()` lists modules, folders and documents.
- **Typed proxies:** every object has `$Type` (e.g. `"Microflows$RetrieveAction"`) and `$ID`; `switch` on `$Type` narrows the type.
- **References are strings:** qualified names such as `"MyModule.Order"` (`shared/qualifiedNameRewrite.ts`).
- **Expressions are strings:** XPath and microflow expressions too (`shared/variableRewrite.ts`, which skips quoted literals).
- **Writing:** set properties, then `await save(unit)`.

---

## 10. Repo map

```
build-extension.mjs        esbuild entry points and deploy target (appDir)
build.helpers.mjs          esbuild config, copy-manifest and copy-to-app plugins
vitest.config.ts           unit test config
ToDo.md                    roadmap
src/manifest.json          main script and UI entry points
src/main.ts                pane, Extensions menu, domain model context menus
src/global.d.ts            .html/.css/.svg imports as strings
src/shared/design/         BGS-UtilityTools design system: tokens.css, bundle.css (incl. run log), bgs-mark.svg,
                           theme, pane mount, DOM helpers, status
src/EntityNameChanger/
  main.ts                  pane entry point (wiring only)
  EntityNameChangerPane.ts pane controller
  contextMenu.ts           "Rename entity…" on domain models
  paneMessages.ts          main ↔ pane messages (module preselect, paneReady handshake)
  entityPicker.ts          entity options for the pickers
  moduleModel.ts           loading modules and entities
  validation.ts            request and name checks
  renameService.ts         builds and runs one rename job
  ui/                      pane.html, PaneView.ts (DOM), runLog.ts (report → run log)
  framework/               RenameJob, RenamePlanner (batches), RenameContext, PrepareStep, EntityRenameStep,
                           NamingPolicy, QualifiedNameRenames, DocumentNameRegistry, DocumentRenamePlan,
                           AssociationRenamePlan, ReferenceIndex, RenameReport, MessageDefinitionUsage,
                           JobTimings, UnitInfoCache, types
  updaters/
    updaterRegistry.ts     every updater per phase, REFERENCE_DOCUMENT_TYPES, EXCLUDED_DOCUMENT_TYPES
    microflows/            FlowUpdater (microflows, nanoflows, rules), MicroflowHelper, ReferenceResolver,
                           ReferenceCache
    pages/                 PageUpdater, PageHelper (pages, snippets)
    domainModels/          AssociationUpdater, associationRename, sharedNames
    documents/             DocumentUpdater + an inspector per type: workflows, mappings, JSON structures,
                           message definitions, datasets, view entity sources, Java/JS actions, published services
    references/            ReferenceUpdater (qualified-name rewrite, optional allow-list)
    refresh/               RefreshUpdater (extra save of pages and snippets)
    shared/                elementWalker, qualifiedNameRewrite, variableRewrite, urlPlaceholders, renameDocument
src/UnitTests/             mirrors src/; helpers/ holds fakes, builders and FakeMessaging
```

### Machine-specific paths

- `appDir` in `build-extension.mjs` points to a Mendix app on this machine. If it doesn't exist, the build doesn't deploy.
- `.vscode/launch.json` points to `C:\Users\Thom\Mendix\...` and Studio Pro 11.12.2, while the API targets 11.12.4. Reading both from an environment variable or a local config would help.
