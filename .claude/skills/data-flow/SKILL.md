---
name: data-flow
description: Use when a feature reads or writes server data, from a new Prisma field or API endpoint all the way to a component. It's the end-to-end recipe (DB → API → client function → query hook → UI states) with the project's conventions for query keys, caching, mutations and errors.
---

# Data flow: endpoint → screen

Data moves in one direction, through fixed layers. Each layer has one job, and `check-data-fetching` enforces the boundary between UI and network.

```
Prisma model ─▶ API handler ─▶ src/api client fn ─▶ query/mutation hook ─▶ component
 (schema)        (validate,      (typed fetch,       (cache, keys,          (render states,
                  authorize)      parse response)     invalidation)          call mutate)
```

## 1. Contract first
Before any code, write down (in the agent workflow this is in `technical-design.md`):
- Request and response types (one source of truth: a shared zod schema, or types generated from the API)
- Errors: which status codes and error shapes the UI must handle
- Auth: who can call it
- Pagination, filtering and sorting params
- The cache key, and which mutations invalidate it

## 2. Backend (Node + Prisma)
1. **Schema**: change `prisma/schema.prisma`, then `prisma migrate dev --name <change>`. New required columns on existing tables need a default or a backfill step. Migrations are usually `owner: me` pieces.
2. **Handler**: validate input (zod `safeParse`), check authorization, then call a service/repository function. No Prisma calls directly in route files when the project has a service layer.
3. **Select only what the UI needs** (`select`/`include`). Never return whole rows with secrets or internal fields.
4. **Errors**: consistent shape (e.g. `{ error: { code, message, fields? } }`) and correct status (400 validation, 401/403 auth, 404, 409 conflict, 422 domain rule).
5. **Lists**: paginate (cursor for infinite lists, offset for numbered pages). Never return unbounded lists.

## 3. Client function (`src/api/…`)
- One function per endpoint. It's typed, uses the project's HTTP client, and **parses** the response (zod) or uses generated types. It throws a typed `ApiError` on non-2xx.
- No React or Vue inside `src/api`. It must work in tests, server code and other hooks.

## 4. Query / mutation hook
- **React** (TanStack Query): see `references/react-query.md`
- **Vue** (TanStack Vue Query / composables): see `references/vue-query.md`

Rules for both:
- **Key factory per resource** (`orderKeys.detail(id)`). Never inline arrays of strings scattered across files.
- **Server state lives only in the query cache.** Don't copy it into `useState`, a store, or Pinia (see `state-decision`).
- Mutations **invalidate** (or update) exactly the keys they affect. Use optimistic updates only when the plan asks for them, always with rollback.
- Set `staleTime` deliberately per resource (reference data: long; live data: short).

## 5. Component
Every async UI renders **all four states** with primitives:
| State | Render |
|---|---|
| pending | `Skeleton` matching the final layout (not a page-wide spinner) |
| error | `Alert`/`ErrorState` with a retry (`refetch`). Field errors map onto the form (`forms` skill) |
| empty | `EmptyState` with the next action |
| success | the data |

Mutations: disable the trigger while pending, show success feedback (toast), and keep user input on error.

## 6. Tests (QA agent / `frontend-testing` skill)
- Client fn: unit test with MSW (success, error shape, parse failure)
- Hook/component: MSW handlers for success / empty / error, asserting what the user sees
- Handler: integration test against a test DB (validation, auth, happy path)

## Checklist
- [ ] Contract written; types shared or generated, not duplicated
- [ ] Input validated and authorization checked server-side
- [ ] Response is parsed, not cast (`as Order`)
- [ ] Key factory + invalidation map documented
- [ ] Pending, error, empty and success states rendered
- [ ] No fetching in components or effects (`check-data-fetching` passes)
