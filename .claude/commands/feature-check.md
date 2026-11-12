---
description: Run QA (and the fix loop if requested) on a piece you built yourself
argument-hint: "<slug> <P#>"
---

Arguments: $ARGUMENTS

This piece is `owner: me`. I built and committed it myself.

1. Find my commit for the piece (`git log --oneline` and look for `[<slug> P#]`). If you can't find it, ask me for the SHA. Record it in `status.md` as `built`.
2. Run the **qa-engineer** subagent for this piece.
3. If it passes, set it to `qa-pass`.
   If it fails, **don't send it to the senior-engineer**. Show me the findings file. I fix my own core pieces. Wait for me, then run QA again when I say so.
