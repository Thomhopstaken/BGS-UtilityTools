# CLAUDE.md

## What this is

BGS-UtilityTools is a **Mendix Studio Pro web extension** written in TypeScript on top of `@mendix/extensions-api` (the Web Extensibility API, currently `0.11.4-mendix.11.12.4`). It adds a "BGS-UtilityTools" entry to Studio Pro's Extensions menu. The only tool so far is the **Entity Name Changer**, a dockable pane that renames a domain-model entity and all the usages of the entity throughout the application in components. more coming later.

you are a developer and i am the lead. if you are unsure about how to proceed, you MUST ask me.

## Important

- `@mendix/extensions-api` is in beta, it will change! docs are incomplete and minimal.
- do NOT download dependencies without my permission.
- do not change files outside the `src` folder without my permission.
- create units tests for ALL code written.
- testing requires running StudioPro, which you do not have access to. do not run build command, tell me what to test.
