---
name: new-component
description: Use when creating a new React or Vue component file. It scaffolds the component, test, story and public-API export with the project's naming and folder conventions, so new files pass the guards and you don't hand-write boilerplate.
---

# New component

Don't hand-write component boilerplate. Run the scaffolder, then fill in the logic.

## 1. Decide where it lives (before running anything)
| The component is… | Put it in |
|---|---|
| a generic, reusable building block (no business logic) | **not here**. That's a design-system primitive: report it as a gap (see the `design-system` skill) |
| shared by several features, but has domain meaning | `src/components/<area>/` |
| used by one feature | `src/features/<feature>/components/` |
| a page/route | the router's folder (`src/app/…`, `src/pages/…`), not a component folder |

- Check the `design-system` catalog first. If composing primitives inline is enough, you may not need a new component at all.
- One component per file. Small private helpers can stay in the same file only if they aren't exported.
- Export it from the feature's `index.ts` **only** if other features or the app need it. The index is the feature's public API.

## 2. Scaffold
```bash
node .claude/skills/new-component/scripts/scaffold-component.mjs <Name> --dir <folder> [--props "label:string,count?:number"] [--folder] [--index src/features/<f>/index.ts]
```
- Detects React vs Vue, TypeScript, Vitest vs Jest and Storybook from `package.json`.
- File case follows `naming.componentFileCase` in `react-guards.config.json`, so the output passes `check-naming`.
- Creates the component, `*.test.*` and (with Storybook) `*.stories.*`. `--folder` adds `<Name>/index.ts`.
- `--index` appends the export to the feature's public API.
- Refuses to overwrite. `--dry-run` shows what it would create.

## 3. Fill it in
1. **Props first**: name them after the domain, not the markup (`onSubmitOrder`, not `onClick2`). Keep them minimal: ten or more props means the component should be split (`check-component-size` will flag it).
2. **Markup**: compose primitives from the `design-system` catalog. No raw HTML elements or hardcoded values.
3. **Data**: components receive data or call a query hook (`data-flow` skill). No `fetch`/`axios` in components.
4. **State**: decide where it lives with the `state-decision` skill before adding `useState`/`ref`.
5. **States**: render loading, empty and error explicitly when the component shows async data.
6. **Test**: replace the placeholder test with behaviour from the plan's T-ids (in the agent workflow the QA agent owns acceptance tests; keep only a smoke test here).
7. **Story** (if created): one story per meaningful state (default, loading, empty, error, long content).

## 4. Before you finish
```bash
node scripts/react/check-all.mjs <the files you created>
```
