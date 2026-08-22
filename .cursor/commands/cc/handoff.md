---
description: >-
  [cc: alias] Compact the session into a Markdown handoff under .codeconductor/ for another agent or human.
---

# Handoff Workflow

Handoff request: $ARGUMENTS

## Step 0 — CCEP Bootstrap

Command: `handoff` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command handoff "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command handoff "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile handoff --output json`
4. After planner/intake JSON is available, run: `npx cc-codeconductor ccep evaluate --command handoff --input <planner.json> --output json`. If `stop` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.

---

## Step 1 — Compact (docs)

Invoke `docs`. Write Markdown only under `.codeconductor/` (for example `.codeconductor/handoff.md`). Include: goal, Task Card status, files touched, tests, open questions, and the next `/cc:` command.

Do not edit source or tests.

---

## Completion

Report the handoff path. Another session should be able to continue from that file alone.
