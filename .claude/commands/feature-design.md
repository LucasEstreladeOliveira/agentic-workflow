---
description: Phase 2 — Staff agent writes the technical design, diagrams, and picks the core pieces for you
argument-hint: "<slug>"
---

Feature slug: $ARGUMENTS

1. Check that `docs/features/$ARGUMENTS/plan.md` has `Status: approved`. If not, stop and tell me.
2. Run the **staff-engineer** subagent in **Mode A (Technical design)** for this slug.
3. When it returns:
   - Update `status.md` with each piece's owner (`me` / `agent`).
   - Show me the end-state overview, the **`owner: me` pieces with reasons and "what to get right" checklists**, and any plan corrections.
   - Tell me the diagrams are in `technical-design.md` (Mermaid renders in GitHub, VS Code and most markdown viewers).
4. **Stop** and ask me to approve the design. Once I approve, tick the gate in status.md and create the branch `feat/$ARGUMENTS` from the base branch if it doesn't exist yet.
