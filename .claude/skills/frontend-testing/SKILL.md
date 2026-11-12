---
name: frontend-testing
description: Use when writing or reviewing frontend tests (unit, component, integration or E2E) for React or Vue. Covers choosing the test level, Testing Library query priorities, MSW network mocking, factories, Playwright page objects, requirement-tagged test names and anti-patterns.
---

# Frontend testing

Tests prove **requirements**, as the user experiences them. Write them from the plan's R-ids and T-ids, not from the implementation.

## 1. Pick the cheapest level that proves the requirement
| Level | Use for | Tools |
|---|---|---|
| **unit** | pure functions, formatters, reducers/stores, hooks/composables with no UI | Vitest/Jest |
| **component / integration** | a component or feature slice with its hooks, store and **mocked network** | Testing Library + MSW |
| **E2E** | critical journeys across pages and the real API: auth, checkout, permissions, anything money-related | Playwright |
| **visual / runtime** | layout, overflow, console errors, keyboard focus | `ui-verification` skill |

Most coverage belongs at the **component/integration** level. Keep E2E few but critical: each one is slow and flaky-prone.

## 2. Naming and traceability
```ts
describe('Checkout coupon', () => {
  it('[T3][R2] rejects an expired coupon with a field error', …);
  it('[extra][R2] trims whitespace before validating', …);
});
```
Every T-id in the plan maps to at least one test. Tag extra edge cases you add with `[extra]`.

## 3. Component tests (Testing Library)
**Query priority**: `getByRole` (with `name`) → `getByLabelText` → `getByPlaceholderText` → `getByText` → `getByDisplayValue` → `getByAltText`/`getByTitle` → `getByTestId` (last resort).
- Interact with `userEvent` (`const user = userEvent.setup()`), not `fireEvent`.
- For async UI, `await screen.findBy…` or `await waitFor(…)`. Never use `setTimeout` sleeps.
- Assert on what the user perceives: text, roles, enabled/disabled, a11y names, URL. Not on state, props, CSS classes or call counts of internals.
- Render with the real providers through a shared `renderWithProviders` (QueryClient with `retry: false`, router, i18n, theme).

Framework specifics: `references/react.md`, `references/vue.md`.

## 4. Network: MSW, not module mocks
- Mock HTTP at the network level with MSW handlers. Keep **default handlers** for the happy path in `src/test/handlers`, and override per test with `server.use(...)` for error, empty and slow cases.
- Build data with **factories** (`buildOrder({ status: 'paid' })`), not inline JSON blobs copied between tests.
- `onUnhandledRequest: 'error'`, so an unmocked call fails loudly.
- Don't `vi.mock('@/api/orders')`. That tests the wiring you mocked, not the behaviour.

## 5. E2E (Playwright)
See `references/e2e.md`. In short: page objects per screen, role-based locators, auto-waiting assertions (`await expect(locator).toBeVisible()`), seeded test data through the API or DB (not the UI), and auth via `storageState`.

## 6. Anti-patterns (QA agent: reject these in review too)
- Snapshot tests of large component trees ("it rendered something")
- Asserting implementation details: hook call counts, internal state, private methods
- `waitFor(() => expect(mock).toHaveBeenCalled())` as the only assertion
- Tests that pass with the feature removed (always check a test fails for the right reason: break the code, watch it go red)
- Shared mutable state between tests, or order-dependent tests
- `skip`/`only`/`todo` left in, or loosened assertions to get green (forbidden for the QA agent)
- Testing third-party or primitive internals again in feature tests

## 7. Done when
- [ ] Every T-id has a passing test with its tag
- [ ] Error, empty and loading paths covered for async UI
- [ ] Each test fails when the behaviour breaks (spot-check by breaking it)
- [ ] Full suite green, with no new flaky retries
