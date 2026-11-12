---
name: figma-to-code
description: Use when implementing or reviewing UI from a design (Figma link, frame, screenshot or spec). Maps the design onto existing primitives and tokens, flags design-system gaps, and checks the result visually against the design.
---

# Figma → code

The goal is a screen that **matches the design using the system**: existing primitives, existing tokens. It should not be a pixel-perfect copy built from raw values.

## 1. Read the design
- **With the Figma MCP connector**: fetch the frame (node id from the link `?node-id=…`), its variables/styles, and a rendered image of it. Prefer the design's *variables* (token names) over raw values when the file has them.
- **Without it**: work from the screenshot or export plus any inspect values you were given. Ask for the frame link if the spec is ambiguous.
- Inventory the frame top-down: layout regions → repeated patterns → individual elements → states (hover, focus, disabled, loading, empty, error) → breakpoints. Missing states are a question for the designer or PM, not a guess.

## 2. Map every element to the system
Make a mapping table **before writing code** (in the agent workflow, the Staff agent puts it in `technical-design.md`):

| Design element | Primitive (from `design-system` catalog) | Props / variant | Notes |
|---|---|---|---|
| "Pay now" button | `Button` | `variant="default" size="lg"` | full width on mobile |
| Price | `Text` | `size="lg" weight="semibold"` | uses `formatCurrency` |

For raw values without a variable name, find the token:
```bash
node .claude/skills/figma-to-code/scripts/nearest-token.mjs "#1F2937" 14px 24px "rgba(0,0,0,.08)"
```
- `exact`: use that token.
- `close`: use that token. If it's a color, mention it in the PR (the design probably drifted from the system).
- `far`: **don't invent a value**. It's a design-system gap. Report it with the closest options and let the lead or designer decide (add a token, or adjust the design).
- Spacing: pick from the spacing scale even if the design is 1–2px off. Off-scale spacing in designs is almost always unintentional.
- Font sizes: use the type scale primitives (`Text size`, `Heading level`), not just the nearest size token.

## 3. Build
- Layout with layout primitives and flex/grid utilities. Avoid absolute positioning unless the design is truly an overlay.
- Mobile-first: implement the smallest breakpoint first, then add larger-breakpoint changes.
- Real content lengths: test with long names, large numbers, missing images, and translated (longer) strings.
- Images and icons: use the project's `Image`/`Icon` primitives with explicit sizes and alt text.

## 4. Verify against the design
Use the `ui-verification` skill to screenshot the route at the design's breakpoints:
```bash
node .claude/skills/ui-verification/scripts/verify-ui.mjs --url http://localhost:3000 --routes /checkout --breakpoints 375,1280
```
Compare the screenshots with the Figma frame side by side. Check: alignment and spacing rhythm, type hierarchy, colors (tokens), states, and that nothing overflows. Fix, then re-run.

## 5. Report
In the piece's summary or PR: the mapping table, any `close`/`far` token decisions, design-system gaps found, and states the design didn't cover.
