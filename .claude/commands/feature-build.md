---
description: Phase 3 — build → QA → fix loop for each piece (agent-owned pieces only)
argument-hint: "<slug> [P# | next | all]"
---

Arguments: $ARGUMENTS (slug, then which piece: a `P#`, `next`, or `all`. Default is `next`.)

Preconditions: the plan and design are approved, the current branch is `feat/<slug>`, and the working tree is clean except for `docs/features/**`. If any of these fail, stop and tell me.

For each piece you're asked to run, in dependency order:

1. **Skip `owner: me` pieces.** If an `owner: me` piece hasn't been built and a later piece depends on it, stop and tell me: "P# is yours. Build and commit it, then run `/feature-check <slug> P#`."
2. Set the piece to `in-progress` in `status.md`.
3. **Build:** run the **senior-engineer** subagent with the slug and piece id. If it reports a blocker or a design gap, set the piece to `blocked`, show me the reason, and stop.
4. Set the piece to `built` and record the commit SHA.
5. **QA:** run the **qa-engineer** subagent with the slug and piece id.
6. If QA returns `PASS`, set the piece to `qa-pass`.
   If QA returns `CHANGES REQUIRED`:
   a. Set the piece to `qa-failed` and increase its QA round count.
   b. Run the **senior-engineer** with the slug, piece id and the findings file path to fix the issues.
   c. Run the **qa-engineer** again for that piece.
   d. Repeat **up to 3 rounds**. If it's still failing, or the developer **disputes** a finding, set it to `escalated`, show me both sides, and stop for my decision.
7. Keep going until there are no runnable pieces left (or after one piece, if I gave a single `P#`/`next`).

Between agents, pass **file paths**, not summaries. The files are the source of truth.

At the end, show the status table and what's next (my pieces, or `/feature-review <slug>` when everything is `qa-pass`).
