# CLAUDE.md

## What this is

BGS-UtilityTools is a **Mendix Studio Pro web extension** written in TypeScript on top of `@mendix/extensions-api` (the Web Extensibility API, currently `0.11.2-mendix.11.12.2`). It adds a "BGS-UtilityTools" entry to Studio Pro's Extensions menu. The tools so far are the **NameChanger**, a dockable pane that renames a domain-model entity and all the usages of the entity throughout the application in components, and the **Prefixer**, which renames or removes a document prefix. more coming later.

you are a developer and i am the lead. if you are unsure about how to proceed, you MUST ask me.
give precise and concise anwsers, do not add more words than needed.

The design system for this project is called BGS-UtilityTools Design System, always use it when building pages and keep it updated. give a warning
when it can't be accessed.

## Important

- `@mendix/extensions-api` is in beta, it will change! docs are incomplete and minimal.
- NEVER write code that updates, creates or deletes marketplace (appstore) module content, this contact can only be read.
- do NOT download dependencies without my permission.
- do not change files outside the `src` folder without my permission.
- create units tests for ALL code written.
- testing requires running StudioPro, which you do not have access to. run the build command only to check if it builds, tell me what to test.
- make annotations were sensable, and keep them short.
- Make liberal use of debug and info logging.
- Communicate every uncertainty about Studio pro.
- NEVER Commit changes in the repo, i will do that.
