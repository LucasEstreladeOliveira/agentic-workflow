---
name: guard-burndown
description: Use when asked to reduce tech debt, clean up guard violations, or "burn down the baseline". Picks a small slice of the accepted violations in .react-guards-baseline.json, fixes it in focused commits, and shrinks the baseline, without changing behaviour.
---

# Guard burndown

`.react-guards-baseline.json` holds the violations that existed when the guards were adopted. This skill pays them down one **small, coherent slice** at a time: one rule in one folder, so every PR is easy to review and safe.

## 1. Pick a slice
```bash
node .claude/skills/guard-burndown/scripts/baseline-report.mjs            # what's left, by rule and folder
node .claude/skills/guard-burndown/scripts/baseline-report.mjs --next     # suggested slice (mechanical rules first, ≤15 items)
node .claude/skills/guard-burndown/scripts/baseline-report.mjs --slice "rule=tokens/color" --slice "path=src/features/cart"
```
- If the user named a rule or area, slice by that. Otherwise take `--next`.
- Keep a slice to **≤ 15 violations**. Effort order: `primitives`, `tokens` (mechanical) → `naming` (renames) → `fetching` (moves code) → `size` (refactors).
- Avoid files with open PRs or active feature work (`git log --since=2.weeks -- <file>`, open branches) to prevent conflicts.
- Numbers in baseline messages are shown as `#`. The slice output gives the exact verify command to see the real values.

## 2. Fix, without changing behaviour
| Rule | How |
|---|---|
| `primitives/raw-element` | swap in the primitive from the `design-system` catalog. Map props carefully (`onClick`, `disabled`, `type`, refs) |
| `tokens/*` | `figma-to-code`'s `nearest-token.mjs` for each value. `far` → leave it, list it as a design question |
| `naming/*` | rename with `git mv` (keeps history), then update **all** imports (`grep -rn` for the old path and name) and the barrel/index exports |
| `naming/one-component-per-file`, `hook-in-component-file` | move to its own file and re-export from the old location if other features import it |
| `fetching/*` | move the call into the API layer and consume it with a query hook (`data-flow` skill). This changes behaviour (caching, loading states), so check them |
| `size/*` | extract sub-components or custom hooks (`state-decision` skill). Pure refactor: same props in, same output |

Rules:
- **No behaviour changes.** If a fix needs one (e.g. a primitive behaves differently), stop and list it instead.
- Don't mix in unrelated cleanup.
- Existing tests must pass unchanged. For `size`/`fetching` refactors, make sure tests cover the component first. If they don't, add characterization tests in a separate first commit.

## 3. Verify
```bash
node scripts/react/check-all.mjs --no-baseline <files in the slice>   # the slice is now clean
pnpm typecheck && pnpm lint && pnpm test                              # nothing else broke
```
For visual changes (primitives, tokens), run the `ui-verification` skill on the affected routes.

## 4. Shrink the baseline and commit
```bash
node scripts/react/check-all.mjs --update-baseline
git diff --stat .react-guards-baseline.json     # must only go DOWN
```
If the baseline grew, you introduced a new violation. Fix it, don't baseline it.

Commit: `refactor(<area>): <rule> burndown in <folder> (-N)`, with the baseline update in the same commit. One slice per commit; up to ~3 slices per PR.

## 5. Report
The slice, violations fixed, any `far` tokens or behaviour-change items left (with file:line), and the remaining baseline total.
