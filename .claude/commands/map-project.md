---
description: Build or refresh docs/architecture/system-map.md with the product-manager agent
argument-hint: "[area to focus on, optional]"
---

Use the **product-manager** subagent to create or update `docs/architecture/system-map.md`.

Focus area (optional): $ARGUMENTS

Tell the agent to follow its "Project map" job and `.claude/templates/system-map.md`. If the file exists, it should only update sections that are out of date, and stamp the current commit (`git rev-parse --short HEAD`).

When it returns, show me a short summary of what changed and anything marked `(?)` that I should confirm.
