---
description: Phase 5 — open the PR after staff and lead approval
argument-hint: "<slug>"
---

Feature slug: $ARGUMENTS

1. Check the gates in `docs/features/$ARGUMENTS/status.md`: staff review APPROVED, and ask me to confirm **"Lead review done"** if it isn't ticked yet. Don't continue without both.
2. Check the branch is `feat/$ARGUMENTS`. Commit any uncommitted files under `docs/features/$ARGUMENTS/` and `docs/architecture/` as `docs(<slug>): feature records`. After that the tree must be clean. Run the project's full checks from `CLAUDE.md` one last time.
3. Push the branch: `git push -u origin feat/$ARGUMENTS`.
4. Open the PR with `gh pr create` against the base branch. Body:
   - **Objective**: from plan.md §1
   - **What changed**: a per-piece list with commit SHAs
   - **Impact**: the indirect-impact table from the plan, summarised
   - **Requirements & tests**: the coverage table from qa-report.md
   - **Dataflow**: embed the overview flowchart from `dataflow.md` (GitHub renders Mermaid) and its cache map. Link the full file for the sequence and ER diagrams.
   - **Manual QA steps**
   - **Docs**: links to plan / design / dataflow / qa-report / staff-review
5. Tick the gate and add the PR link to status.md. Leave that change uncommitted unless I ask; it's bookkeeping.
6. Give me the PR URL.
