---
description: Phase 1 — PM agent writes the feature plan (objective, impact, requirements, tests, pieces)
argument-hint: "<slug> <feature description or ticket link>"
---

Arguments: $ARGUMENTS
The first word is the feature **slug**. The rest is the feature description.

1. If `docs/architecture/system-map.md` doesn't exist, run the **product-manager** subagent to create it first (its "Project map" job).
2. Create `docs/features/<slug>/` and copy `.claude/templates/status.md` there as `status.md` (fill in the name and slug).
3. Run the **product-manager** subagent with the slug and the full description to write `docs/features/<slug>/plan.md` (its "Feature plan" job). Pass along any links or files I gave.
4. If it comes back with **open questions**, show them to me and wait for my answers. Then run the agent again with the answers so it updates the plan. Repeat until there are no open questions.
5. Show me: the objective, the indirect-impact table, the requirement count, and the list of pieces. Then **stop** and ask me to review `plan.md`.

Do not continue to the design phase until I say the plan is approved. When I approve, set `Status: approved` in plan.md and tick the gate in status.md.
