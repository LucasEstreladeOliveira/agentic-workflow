---
name: design-system
description: Use whenever you build or change UI. It lists the project's design-system primitives (components, props, variants), tokens and layout patterns, so you compose screens from existing primitives instead of raw HTML, hardcoded values or new one-off components.
---

# Design system

Every visible element comes from the primitives in the UI folder (default `src/components/ui`), styled only with tokens. The guard scripts (`check-primitives`, `check-design-tokens`) block raw `<input>` tags and hardcoded colors or spacing. This skill is how you get it right the first time.

## 1. Look up before you build
1. Read `catalog.md` in this folder. It is generated from the source, so it's accurate.
   - If it's missing or stale (`--check` fails), regenerate it:
     `node .claude/skills/design-system/scripts/build-catalog.mjs --dir src/components/ui --alias @/=src/`
   - Vue projects: the script reads `defineProps`, `withDefaults`, `defineEmits` and slots too.
2. Search the catalog for the job you need done (button, field, modal, list, empty state…), not for an HTML tag.
3. Only open a primitive's source if the catalog doesn't answer a question about behaviour.

## 2. Choosing a primitive
- **Use a variant, not a className override.** `<Button variant="destructive">`, never `<Button className="bg-red-500">`. If no variant fits, that's a design-system gap (see §4).
- **Use the field components** (`Input`, `Select`, `Textarea`, `Checkbox`…) together with the form wrapper from the `forms` skill. They carry label, error and `aria-*` wiring.
- **Use layout primitives** (`Stack`, `Inline`, `Grid`, `Container`, if the project has them) for spacing between elements. Don't add margins to children. Gaps come from tokens.
- **Typography**: `Heading`/`Text` with `level`/`size` props, never raw `h1`–`h6` or font-size utilities.
- **Icons** go through the project's `Icon` primitive or icon set, sized with tokens.
- **Interaction primitives** (Dialog, Popover, Tooltip, DropdownMenu, Tabs) already handle focus trapping, Esc, aria and portals. Never rebuild them with `div` + state.

## 3. Tokens
- Colors, spacing, radius, shadows and type sizes come from tokens: Tailwind theme classes (`bg-surface`, `p-4`, `text-sm`) or CSS variables (`var(--color-surface)`). No hex values, no `p-[13px]`.
- Matching a design value (e.g. from Figma) to a token: use the `figma-to-code` skill's `nearest-token.mjs`.
- Sizing and spacing follow the scale. If a design uses 14px where the scale has 12 and 16, pick the nearest step and note it. Don't invent a value.

## 4. When nothing fits (design-system gaps)
Don't create a one-off component inside a feature that duplicates a primitive's job, and don't style around a primitive. Instead:
1. Check whether composing existing primitives solves it (that's usually the case).
2. If not, **stop and report the gap**: what's needed, which primitive is closest, and a suggested API (new variant/prop vs new primitive). In the agent workflow this goes to the lead as a `Deviation:` or a blocker, because primitives are shared code and usually `owner: me` work.
3. Changes to `src/components/ui` need a story and a test, and you must regenerate `catalog.md`.

## 5. Checklist before you finish
- [ ] No raw interactive or semantic HTML where a primitive exists (`check-primitives` passes)
- [ ] No hardcoded colors, spacing or font sizes (`check-design-tokens` passes)
- [ ] Variants used instead of className overrides on primitives
- [ ] Every interactive element is reachable by keyboard and has an accessible name
- [ ] Empty, loading and error states use the project's primitives (Skeleton, EmptyState, Alert…)
