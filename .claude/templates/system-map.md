# System map

> Maintained by the `product-manager` agent. Last updated: YYYY-MM-DD (commit `<sha>`).
> `(?)` = inferred, not verified.

## 1. Product in one paragraph
What the product does, who uses it, main user journeys.

## 2. Repos / apps / packages
| Path | Purpose | Stack | Runs where |
|---|---|---|---|

## 3. Domain model
Key entities, relations, invariants. Link to `prisma/schema.prisma` (or equivalent).

```mermaid
erDiagram
```

## 4. API surfaces
| Surface | Location | Auth | Consumers |
|---|---|---|---|

## 5. Integrations & side effects
External services, queues, webhooks, emails, analytics, cron jobs.

## 6. Frontend architecture
Routing, state management, data fetching, design system / component library, i18n, feature flags.

## 7. Cross-cutting concerns
AuthN/AuthZ model, error handling, logging/observability, caching, config/env.

## 8. Testing setup
Unit runner, integration (DB strategy), E2E runner, fixtures/factories, commands.

## 9. Hotspots & gotchas
Fragile areas, tech debt, things that break when touched.
