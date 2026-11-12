# React guard scripts

Fast, deterministic checks that agents (and humans) run instead of spending tokens reviewing the same rules by hand. Each script is dependency-free (it uses the project's own `typescript` to parse), prints one line per problem (`file:line:col → fix`), and supports a Claude Code hook mode so a violation goes straight back to the agent that made it.

## check-primitives

Flags raw HTML elements that should be design-system primitives:

```
src/features/checkout/Form.tsx:12:7  <input> → use <Input /> from "@/components/ui/input"
src/features/checkout/Form.tsx:4:14  <button> (styled) → use <Button /> from "@/components/ui/button"
src/features/checkout/Form.tsx:7:14  <select> (createElement) → use <Select /> from "@/components/ui/select"
```

It catches JSX (`<input>`), `React.createElement('input')`, and `styled.input` / `styled('input')`. It ignores components (`<Input>`), member tags (`<motion.div>`) and custom elements (`<my-widget>`).

### Setup

1. Copy `scripts/react/check-primitives.mjs` into the project.
2. Copy `primitives.config.example.json` to the repo root as `primitives.config.json` and set:
   - `rules`: tag → `{ use, from, allowIf?, message? }`. `allowIf` lists attribute exceptions, e.g. `{ "type": ["hidden"] }`. If the attribute's value is dynamic, the element is still flagged, to be safe.
   - `exclude`: always exclude the primitives folder itself (it has to use the native tags), plus stories and tests if you like.
3. Add scripts to `package.json`:
   ```json
   "lint:primitives": "node scripts/react/check-primitives.mjs",
   "lint:primitives:changed": "node scripts/react/check-primitives.mjs --changed=main"
   ```

### Modes

| Command | Use |
|---|---|
| `node scripts/react/check-primitives.mjs` | full scan of `include` dirs (CI) |
| `… src/a.tsx src/b.tsx` | specific files (lint-staged, pre-commit) |
| `… --changed[=main]` | only files changed vs a base branch, including untracked ones (fast local / agent check) |
| `… --json` | machine-readable output |
| `… --hook` | Claude Code `PostToolUse` hook (reads the edited file from stdin, exit 2 sends the violations back to the agent) |

Exit codes: `0` clean, `1` violations, `2` hook-mode violations or config error.

### Escape hatch

```tsx
{/* primitives-ignore-next-line: native file picker required by legacy uploader */}
<input type="file" />
```
`// primitives-ignore-file: <reason>` skips the whole file. A reason is required while `requireIgnoreReason` is `true`, so `git grep primitives-ignore` gives you an audit list.

### Wire it in

**Claude Code hook** (every agent, the senior-engineer included, gets told right after it writes a raw `<input>`). Add to `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/react/check-primitives.mjs\" --hook" }
        ]
      }
    ]
  }
}
```
In hook mode the script exits 0 for non-JSX files, excluded paths, or when there's no `primitives.config.json`, so it never gets in the way elsewhere.

**lint-staged**
```json
"lint-staged": { "*.{tsx,jsx}": "node scripts/react/check-primitives.mjs" }
```

**CI**
```yaml
- run: node scripts/react/check-primitives.mjs
```

**Agent workflow**: add `Primitives: pnpm lint:primitives:changed` to the Commands list in `CLAUDE.md`. The senior-engineer runs everything listed there before it commits.
