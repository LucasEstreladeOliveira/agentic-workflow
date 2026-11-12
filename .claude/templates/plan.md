# <Feature name>

- **Slug:** `<slug>`
- **Ticket:** <link>
- **Status:** draft | approved
- **Base branch:** main

## 1. Objective
What outcome for whom, and why now (2–4 sentences).

**Out of scope**
-

## 2. Assumptions & open questions
**Assumptions**
-

**Open questions** (must be answered before approval)
- [ ]

## 3. Impact map
### Direct changes
| Area | Files / modules | Change |
|---|---|---|

### Indirect impact
| Affected thing | How it's affected | Risk (L/M/H) | How we verify |
|---|---|---|---|

## 4. Requirements (Definition of Done)
| ID | Requirement (observable behaviour) | Type |
|---|---|---|
| R1 | | functional |
| R2 | | non-functional (a11y/perf/security/compat) |

## 5. Acceptance tests
| ID | Covers | Level | Given / When / Then |
|---|---|---|---|
| T1 | R1 | unit / integration / e2e / manual | **Given** … **When** … **Then** … |

## 6. Pieces
Each piece: ~1 commit, leaves the app working, independently testable, in dependency order.

### P1 — <title>
- **Owner:** agent | me   _(set by staff-engineer)_
- **Depends on:** —
- **Implements:** R1
- **Tests:** T1
- **Behind flag:** no
- **Scope (what, not how):**

### P2 — <title>
- **Owner:**
- **Depends on:** P1
- **Implements:**
- **Tests:**
- **Behind flag:**
- **Scope:**

## 7. Traceability
| Requirement | Tests | Pieces |
|---|---|---|
| R1 | T1 | P1 |
