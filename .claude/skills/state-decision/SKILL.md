---
name: state-decision
description: Use before adding state (useState, useReducer, context, a store, ref/reactive, Pinia) or when a component has too much state. A decision guide for where each piece of state belongs — server cache, URL, form, local, shared or global — and how to fix misplaced state.
---

# Where does this state live?

Most bugs and "god components" come from state in the wrong place: server data copied into `useState`, filters that vanish on refresh, a global store holding a modal's open flag. Decide **before** writing the hook.

## Decision tree (first match wins)
1. **Does it come from the server?** → **query cache** (`data-flow` skill). Never copy it into local state or a store. Edits go to a form; changes go through a mutation.
2. **Should it survive refresh, be shareable as a link, or work with the back button?** (filters, search, sort, pagination, selected tab, open detail id) → **URL** (search params / route params).
3. **Is it the input of a form being edited?** → **form state** (`forms` skill: RHF / vee-validate).
4. **Can it be computed from other state or props?** → **derive it** during render (`const total = items.reduce(…)`, Vue `computed`). Not state at all. Use `useMemo` only if it's measurably expensive.
5. **Used by one component (or it plus direct children)?** → **local state** (`useState`/`useReducer`, `ref`).
6. **Shared by a subtree** (a wizard, a compound component, a feature panel)? → **lift to the nearest common parent**. If prop drilling goes 3+ levels, use **scoped context / provide-inject** at that subtree's root.
7. **Truly app-wide client state** (auth session/user, theme, feature flags, cart in a non-server-cart app, toasts) → **global store** (Zustand/Jotai/Redux · Pinia). Keep it small, with typed actions.
8. **Should it persist across sessions on this device** (dismissed banners, UI preferences)? → **storage-backed store** (persist middleware / `useLocalStorage`), with a version for migrations.

## Smells → fixes
| Smell | Fix |
|---|---|
| `useEffect(() => setX(derive(y)), [y])` / `watch(y, () => x.value = …)` | derive it during render / `computed` |
| `const [data, setData] = useState(query.data)` | use `query.data` directly; for editing, use the form's `values` |
| `isLoading`/`error` state next to a `fetch` | use a query hook |
| several booleans that can't all be true at once (`isOpen`, `isSaving`, `isDone`) | one status union in `useReducer` / a state machine (`'idle' \| 'saving' \| 'done'`) |
| more than `size.maxState` `useState`s (`check-component-size`) | group related state into `useReducer`, or extract a custom hook per concern |
| filters in `useState` reset on refresh | move them to URL search params |
| global store holding one screen's UI flags | move them back to local state or the screen's context |
| context value recreated every render → whole tree re-renders | memoize the value, split state/dispatch contexts, or use a selector-based store |
| prop drilling 3+ levels of the same prop | composition (pass children/slots) first, then scoped context |

## Ownership in the agent workflow
- The **Staff agent** states each new piece of state and its home in `technical-design.md` ("filters → URL `?status=`, draft → RHF, list → query `orderKeys.list(filters)`").
- The **Senior agent** follows that. If it needs state the design doesn't mention, it applies this tree and notes `Deviation:` when the choice is non-obvious.
- Adding a **new global store, or a new slice in one**, is always a design decision, never an implementation detail.
