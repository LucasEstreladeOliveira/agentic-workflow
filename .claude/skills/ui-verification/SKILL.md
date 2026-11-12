---
name: ui-verification
description: Use before marking UI work done, after implementing or fixing a screen. Runs the app's routes in a real browser at several breakpoints and reports layout overflow, console/runtime errors, failed requests, accessibility problems and keyboard focus issues, with screenshots to compare against the design.
---

# UI verification

Unit tests prove logic. This check proves the screen actually works in a browser: no layout breakage, no runtime errors, usable with a keyboard. It's cheap: one script, one report.

## 1. Run the app
- Start the dev server if it isn't running (`pnpm dev`, port from `CLAUDE.md`). Run it in the background and wait until the URL responds.
- Routes behind auth: save a Playwright storage state once (`npx playwright codegen --save-storage=.auth.json <url>`, or the project's E2E login helper) and pass `--storage-state .auth.json`. Never commit it.
- Seed or mock the data the route needs. Empty and error states need their own runs (e.g. a query param or MSW scenario that forces them).

## 2. Run the check
```bash
node .claude/skills/ui-verification/scripts/verify-ui.mjs \
  --url http://localhost:3000 --routes /checkout,/orders/123 \
  --breakpoints 375,768,1280 [--storage-state .auth.json] [--wait-for "main"]
```
Writes `.ui-verify/` (add it to `.gitignore`): `report.md`, `report.json`, `<route>@<width>.png`, `<route>.focus-order.txt`.

| Finding | Severity | Typical fix |
|---|---|---|
| `overflow` | error | fixed widths or long unbroken strings: use `min-w-0`, `truncate`/`break-words`, responsive layout primitives |
| `console-error`, `uncaught-exception` | error | hydration mismatches, missing keys, undefined data: fix the cause, don't silence it |
| `request` 5xx / failed | error (4xx = warning) | wrong endpoint, missing mock, auth |
| `unnamed-control`, `unlabelled-field`, `img-no-alt` | error | use primitives with `label`/`aria-label`; decorative images get `alt=""` |
| `broken-image` | error | wrong path or missing asset |
| `axe:*` serious/critical | error | follow the rule's help text (contrast, roles, aria) |
| `focus-not-visible`, `focus-offscreen` | warning | primitives should provide `:focus-visible` styles; hidden elements need `tabindex="-1"` or `inert` |

Install `axe-core` as a devDependency for the full WCAG scan. Without it, only the built-in heuristics run.

## 3. Look at the screenshots
Open the PNGs (Read tool) for each breakpoint. Check:
- Layout matches the design (`figma-to-code` mapping) at each breakpoint
- Nothing clipped, overlapping, or unexpectedly wrapped
- Loading, empty and error states look intentional
- The focus order in `*.focus-order.txt` follows the visual reading order

## 4. Fix, then re-run until there are no errors
Warnings need a decision: fix them, or note them in the summary with a reason.

## In the agent workflow
- **QA agent**: run it for every piece that changes UI, after the automated tests. Add `verify-ui` errors to the findings file like any failing requirement (it never fixes code).
- **Senior agent**: run it before committing a UI piece. It catches most of what QA would bounce back.
- Attach the relevant screenshots to the PR for the lead's review.
