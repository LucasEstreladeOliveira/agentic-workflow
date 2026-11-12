# React guard scripts

Fast, deterministic checks that agents (and humans) run instead of spending tokens reviewing the same rules by hand.

- **No extra dependencies.** They parse with the project's own `typescript`.
- **One config file**, `react-guards.config.json`, for every check.
- **One line per problem**: `file:line:col  [check/rule] what's wrong → what to do`.
- **Claude Code hook mode.** A violation goes straight back to the agent that just wrote it.
- **Baseline**, so you can turn the checks on in an existing codebase and only block *new* violations.

| Script | Check | Catches |
|---|---|---|
| `check-primitives.mjs` | `primitives` | `<input>`, `<button>`, `styled.input`, `createElement('a')` → design-system primitives |
| `check-design-tokens.mjs` | `tokens` | hex/rgb/hsl colors, raw `px`/`rem` spacing & type, Tailwind arbitrary values (`p-[13px]`), inline style values, also in `.css/.scss` |
| `check-naming.mjs` | `naming` | component/hook/file/folder naming, export ↔ file name, one component per file, hooks in component files |
| `check-component-size.mjs` | `size` | component/hook length, too many `useState`/effects/props, deep JSX, long files |
| `check-data-fetching.mjs` | `fetching` | `fetch`/`axios` outside the API layer, HTTP-client imports, data loading inside `useEffect` |
| `check-all.mjs` | all | runs every enabled check in one pass (each file parsed once) |

Import boundaries and UI-library imports live in ESLint instead: see [`configs/eslint`](../../configs/eslint/README.md).

## Setup

1. Copy `scripts/react/` (including `lib/`) into the project.
2. Copy `react-guards.config.example.json` to the repo root as **`react-guards.config.json`** and adjust:
   - `primitives.rules`: your tag → primitive mapping (this check is skipped until the section exists)
   - `exclude`s: always exclude the primitives folder and the token/theme definitions
   - thresholds and paths (`size`, `fetching.allowedIn`, `naming.folderCase`…)
3. Add `package.json` scripts:
   ```json
   "guards": "node scripts/react/check-all.mjs",
   "guards:changed": "node scripts/react/check-all.mjs --changed=main",
   "guards:baseline": "node scripts/react/check-all.mjs --update-baseline"
   ```
4. **Existing codebase?** Run `pnpm guards:baseline` once and commit `.react-guards-baseline.json`. From then on, only new violations fail. Re-run it after a cleanup to shrink the baseline. Baseline entries are matched by file + rule + message (numbers ignored), not by line, so editing a file doesn't invalidate them.

## CLI (every script)

| Flag | |
|---|---|
| *(none)* | scan the `include` dirs (default `src`) |
| `a.tsx b.tsx` | only these files (lint-staged) |
| `--changed[=main]` | files changed vs base + untracked |
| `--hook` | Claude Code PostToolUse mode: reads the edited file from stdin, exit 2 with errors on stderr |
| `--json` | machine-readable |
| `--strict` | warnings fail too (CI) |
| `--only=tokens,size` | `check-all` subset |
| `--update-baseline` / `--no-baseline` | write / ignore the baseline |
| `--config <path>` | default `react-guards.config.json` |

Exit codes: `0` clean · `1` errors · `2` hook-mode errors or config error.

## Severity

Every rule defaults to `error`. Override per check:
```json
"size": { "severity": { "file-lines": "warn", "jsx-depth": "off" } }
```
Warnings show up in the output but don't fail, and they're hidden in hook mode, so agents only get interrupted for errors. `--strict` turns warnings into errors (use it in CI if you want).

## Escape hatches

```tsx
// tokens-ignore-next-line: partner brand color, mandated by contract
<span style={{ color: '#123456' }} />
```
- `<check>-ignore-next-line: <reason>` on the line above. In JSX use `{/* … */}`. For `size`, put it above the component declaration.
- `<check>-ignore-file: <reason>` anywhere in the file.
- `react-guards-ignore-next-line: <reason>` ignores every check.
- A reason is required (`requireIgnoreReason: true`). An ignore without one is reported itself, so `git grep -- '-ignore-'` is your audit list.

## Rules reference

### primitives
| Rule | |
|---|---|
| `raw-element` | `rules: { tag: { use, from?, message?, allowIf?: { attr: [values] } } }`. `allowIf` is checked only for literal values. `checkCreateElement`, `checkStyled` |

### tokens
| Rule | Options |
|---|---|
| `color` | `colors: true`. Hex (3/4/6/8), `rgb()`, `hsl()`, `oklch()`… in strings, templates and CSS. Skips imports, CSS custom-property definitions, `$scss`/`@less` vars, and `ignoreAttributes` (`href`, `src`, `id`…) |
| `raw-unit` | `units`, `unitProperties` (margin/padding/gap/font-size/line-height/letter-spacing/border-radius), `allowUnitValues` (`0`, `1px`). Checks `style={{}}` (bare numbers = px), styled/css templates, CSS files |
| `arbitrary` | `tailwindArbitrary`, `allowArbitrary` (regexes on the utility, e.g. `^grid-(cols\|rows)-`, `var(--…)`, `calc(`) |
| `inline-style` | `inlineStyle: "values"` (default, check values only) · `"forbid"` (flag every `style=`) · `"off"` |

### naming
| Rule | Options |
|---|---|
| `component-file-case` | `componentFileCase: "PascalCase"` (or `"kebab-case"` for shadcn-style) |
| `export-matches-file` | `matchExportToFile`. `index.tsx` is compared with its folder |
| `one-component-per-file` | `maxComponentsPerFile: 1`, `allowCompoundComponents` (`Card` + `CardHeader` OK) |
| `hook-in-component-file` | exported `useX` from a component file |
| `hook-file-name` | `hookFileCase: "camelCase"` (`useCart.ts`) or `"kebab-case"` (`use-cart.ts`), and the file must export the matching hook |
| `hook-location` | `hooksLocation: ["src/hooks/**", "src/features/*/hooks/**"]` (off when empty) |
| `folder-case` | `folderCase: ["kebab-case"]`, `folderIgnore` (`__tests__`, `[id]`, `(group)`, `@slot`, `_private` by default) |
| `file-case` | `otherFileCase` for non-component, non-hook files (off by default) |

Next.js / Vite special files (`page`, `layout`, `route`, `index`, `main`, `App`…) are exempt from file-case rules (`reservedFiles`).

### size
`component-lines` (200) · `hook-lines` (120) · `state` (5, useState + useReducer) · `effects` (3) · `props` (10, from destructuring, the props type, or `FC<Props>`) · `jsx-depth` (8) · `file-lines` (400).

### fetching
| Rule | Options |
|---|---|
| `forbidden-import` | `forbiddenImports` outside `allowedIn` (type-only imports allowed) |
| `forbidden-call` | `forbiddenCalls` (`fetch`, `axios.*`…; `*` wildcard), `forbiddenConstructors` (`XMLHttpRequest`) outside `allowedIn` |
| `fetch-in-effect` | inside `useEffect`/`useLayoutEffect`, *anywhere*: forbidden calls and calls matching `effectFetchPattern` (`fetchX`, `loadX`, `getX`…) |

Next.js: with `allowServerComponents` (default), files under `appDir` without `"use client"` and files with `"use server"` may fetch.

## Wire it in

**Claude Code hook**: every agent gets the feedback right after it writes the code. `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/react/check-all.mjs\" --hook" }
        ]
      }
    ]
  }
}
```
Hook mode exits 0 for non-matching files, files outside `include`, excluded paths, baselined violations, and repos without `react-guards.config.json`.

**lint-staged**
```json
"lint-staged": { "*.{tsx,jsx,ts,js,css,scss}": "node scripts/react/check-all.mjs" }
```

**CI**
```yaml
- run: node scripts/react/check-all.mjs --strict
```

**Agent workflow**: add `Guards: pnpm guards:changed` to the Commands list in `CLAUDE.md`. The senior-engineer runs it before every commit, and the staff-engineer's final review can rely on it instead of re-checking these rules by hand.
