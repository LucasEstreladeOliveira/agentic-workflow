---
description: Phase 4 — full QA run, then Staff review of the whole branch, then hand-off to you
argument-hint: "<slug>"
---

Feature slug: $ARGUMENTS

1. Check that every piece in `status.md` is `qa-pass`. If not, list the ones that aren't and stop.
2. **Final QA:** run the **qa-engineer** with piece `all`. It runs the whole feature's tests plus the full suite and finishes `qa-report.md` (every R-id must be PASS). If anything fails, go through the fix loop from `/feature-build` for the affected piece, then repeat this step.
3. **Staff review:** run the **staff-engineer** in **Mode B (Final review)**. The base is the plan's base branch.
4. If the verdict is `CHANGES REQUIRED`:
   - Collect the BLOCKER and SHOULD findings. Write them per piece to `docs/features/$ARGUMENTS/findings/P#-staff-<round>.md`.
   - Send `agent` pieces to the **senior-engineer** and then the **qa-engineer**. Show me the findings for `me` pieces.
   - Run the staff review again. Stop and escalate to me after 2 rounds.
5. When it's `APPROVED`, tick the gate and give me a **lead review brief**:
   - the commit list (`git log --oneline <base>..HEAD`)
   - the files with the highest risk, and what to look at in each
   - the requirement coverage table
   - any NITs left open
   - manual test steps for `manual` T-ids

Then **stop**. I review the code myself. When I'm happy I'll run `/feature-pr $ARGUMENTS`.
