# ESLint: React architecture rules

`react-architecture.mjs` is a flat-config factory that enforces:

1. **UI libraries only inside the primitives folder.** `@radix-ui/*`, `@mui/*`, `react-select`, `next/link`… can only be imported from `src/components/ui`. Everywhere else you get *"Use the design-system primitive from @/components/ui"*. This pairs with `scripts/react/check-primitives.mjs`, which covers raw HTML tags.
2. **Architecture boundaries**
   - **Layers**: each folder lists what it may import. Out of the box, `components` can't import `features` or `api`, `ui` can't import `components` (other than `ui`) or `features`, and `lib` can only import `types` and `config`.
   - **Features**: `@/features/orders` (public API) is fine. `@/features/orders/components/OrderRow` is blocked, and so is `../../orders/…` from another feature. A feature can always import its own internals.
   - **Relative depth**: `../../../x` must use the `@/` alias (configurable, or `null` to turn it off).

It needs no plugins: it generates `no-restricted-imports` blocks per layer and per feature folder (features are discovered when ESLint starts).

## Setup

1. Copy `configs/eslint/react-architecture.mjs` into the project.
2. Add it to `eslint.config.mjs` (see `eslint.config.example.mjs`):
   ```js
   import { reactArchitecture } from './configs/eslint/react-architecture.mjs';
   export default [...yourConfigs, ...reactArchitecture({ root: import.meta.dirname })];
   ```
3. Adjust `layers`, `uiDirs`, `uiLibraries` and `restrictedModules` to match the repo.

### Options

| Option | Default | |
|---|---|---|
| `srcDir` / `alias` | `src` / `@/` | `@/features/x` ↔ `src/features/x` |
| `uiDirs` | `['src/components/ui']` | folders allowed to import UI libraries |
| `uiLibraries` | radix, headlessui, mui, chakra, mantine, antd, react-select… | gitignore-style patterns |
| `restrictedModules` | `next/link`, `next/image` | `{ name, importNames?, message }` |
| `layers` | app → features → components → ui · hooks → api → lib | `{ name, dir, canImport: [] }` |
| `featuresDir` | `src/features` | every sub-folder is a feature |
| `maxRelativeDepth` | `2` | `null` = off |
| `ruleName` | `no-restricted-imports` | use `@typescript-eslint/no-restricted-imports` to allow `import type` |

## Notes and limits

- Rules match the **import text**, not the resolved file. Alias imports are checked exactly. Relative imports are checked by pattern: `../orders/…` from inside `features/cart` is caught, but only up to `relativeFeatureDepth` levels. Together with `maxRelativeDepth` this covers the usual cases. If you need imports resolved fully (barrels, tsconfig paths, monorepo packages), move this to `eslint-plugin-boundaries` or `dependency-cruiser`. The layer model maps over one-to-one.
- Flat config uses the **last matching block** for a rule, so each generated block includes the complete pattern list for that folder. If you add your own `no-restricted-imports` config, add it inside this factory (e.g. via `restrictedModules`) rather than in a separate block, or it will replace these rules for the files it matches.
- Tested on ESLint 10 (flat config).
