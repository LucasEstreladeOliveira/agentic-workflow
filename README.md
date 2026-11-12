# Agent development workflow

Four Claude Code subagents plus slash commands that run them. You stay in control at every gate.

```mermaid
flowchart TD
    A["/map-project<br/>PM → system-map.md"] --> B["/feature-plan slug desc<br/>PM → plan.md"]
    B -->|open questions| B
    B --> G1{{You approve plan}}
    G1 --> C["/feature-design slug<br/>Staff → technical-design.md<br/>diagrams + owner: me/agent"]
    C --> G2{{You approve design}}
    G2 --> D["/feature-build slug all"]

    subgraph LOOP [per piece, in dependency order]
      D --> E{owner?}
      E -->|agent| F[Senior → 1 commit]
      E -->|me| M[You build + commit<br/>/feature-check slug P#]
      F --> Q[QA → tests + qa-report]
      M --> Q
      Q -->|CHANGES REQUIRED<br/>findings/P#-qa-n.md| F
      Q -->|≤3 rounds or dispute| X{{Escalate to you}}
      Q -->|PASS| OK[qa-pass]
    end

    OK --> R["/feature-review slug<br/>QA full run → Staff review"]
    R -->|findings| F
    R --> G3{{You review the branch}}
    G3 --> P["/feature-pr slug → gh pr create"]
```

## Install

Copy into the root of each repo:

```
.claude/
  agents/      product-manager.md  staff-engineer.md  senior-engineer.md  qa-engineer.md
  commands/    map-project  feature-plan  feature-design  feature-build  feature-check  feature-review  feature-pr  feature-status
  hooks/       restrict-writes.mjs
  templates/   system-map.md  plan.md  technical-design.md  qa-report.md  status.md
```

Then add the snippet from `CLAUDE.workflow-snippet.md` to the repo's `CLAUDE.md` and fill in the real commands. Every agent reads it to know how to typecheck, lint, test and run E2E. Commit `.claude/` so the team (and other machines) get the same setup.

Requires: Node (for the guard hook), `git`, `gh` (for the PR step).

## Roles

| Agent | Model | Writes | Never |
|---|---|---|---|
| `product-manager` | opus | `docs/**` | app code |
| `staff-engineer` | opus | `docs/**` (+ `owner` field in plan) | app code, fixes |
| `senior-engineer` | sonnet | app code, 1 commit per piece | tests for acceptance, `owner: me` pieces, pushes |
| `qa-engineer` | sonnet | tests, fixtures, mocks, `docs/features/**` | app code, weakening tests |

Change the `model:` lines to suit your budget. Opus for the two reasoning-heavy roles is the main thing worth keeping.

Write limits are **enforced** by a `PreToolUse` hook (`restrict-writes.mjs`), not just asked for in the prompt. If QA tries to edit `src/…`, the edit is blocked and QA is told to write a finding instead. The hook covers Edit/Write. QA and PM still have `Bash`, which they need to run tests and git, so the prompt also forbids shell-based edits. Tighten the regexes in the hook's `PROFILES` to match your repo layout.

## Per-feature files (the handoff contract)

```
docs/
  architecture/system-map.md          # long-lived project understanding
  features/<slug>/
    plan.md               # PM: objective, impact, R-ids, T-ids, P-ids
    technical-design.md   # Staff: contracts, diagrams, per-piece scope, owner
    status.md             # orchestrator: piece states + gates
    qa-report.md          # QA: R → tests → PASS/FAIL with evidence
    findings/P2-qa-1.md   # QA → Senior requested changes
    findings/P2-staff-1.md
    staff-review.md       # Staff: final verdict
```

Agents pass **file paths**, not chat summaries, so every decision can be traced and the work survives `/clear` or a new session. Pick up anywhere with `/feature-status <slug>`.

IDs tie it together: `R#` requirement → `T#` acceptance test → `P#` piece → commit `[slug P#]` → test name `[T#][R#]`.

## Typical run

```
/map-project                                   # once per repo, refresh occasionally
/feature-plan coupon-codes "Users can apply a coupon at checkout… (ticket link)"
  → answer open questions → review plan.md → "approved"
/feature-design coupon-codes
  → read diagrams, note your core pieces → "approved"
/feature-build coupon-codes all
  → it stops at your piece (e.g. P2 discount calculation)
  → you build + commit:  feat(checkout): discount engine [coupon-codes P2]
/feature-check coupon-codes P2
/feature-build coupon-codes all                # continues after P2
/feature-review coupon-codes
  → read the lead review brief, review the diff yourself
/feature-pr coupon-codes
```

## Guard scripts

`scripts/react/` has deterministic checks that agents run instead of spending tokens on rule-following reviews. See [scripts/react/README.md](scripts/react/README.md).

| Script | Catches |
|---|---|
| `check-primitives.mjs` | raw HTML tags (`<input>`, `<button>`…) that should be design-system primitives |
| `check-design-tokens.mjs` | hardcoded colors, px/rem values, Tailwind arbitrary values |
| `check-naming.mjs` | file/folder/component/hook naming, one component per file |
| `check-component-size.mjs` | god components: length, state, effects, props, JSX depth |
| `check-data-fetching.mjs` | fetch/axios outside the API layer, fetching in `useEffect` |
| `check-all.mjs` | all of the above in one pass, the one to use in hooks and CI |

All share one config (`react-guards.config.json`), support `--changed`, `--hook` and a baseline for existing codebases.

`configs/eslint/` has an ESLint flat-config template for **import rules**: UI libraries only inside the primitives folder, layer boundaries, and features only importable through their public API. See [configs/eslint/README.md](configs/eslint/README.md).

## Tuning tips

- **Piece size**: if the senior agent's commits get large, tighten "~300 lines" in the PM prompt. Small pieces make QA rounds much cheaper.
- **Parallelism**: pieces with no dependency between them can be built in parallel using worktrees (`isolation: worktree`). Start serial, and add this once the flow feels reliable.
- **Your core pieces**: if Staff marks too much or too little as `owner: me`, edit the examples list in `staff-engineer.md` with your own rules (e.g. "anything touching Prisma migrations is always me").
- **Escalation limits**: 3 QA rounds per piece and 2 staff rounds are set in the commands. A piece that loops usually means the design was wrong, not the code.
