---
description:
  Evaluate deliverable quality — scorecard, outcome tracking, regression checklist.
---

# Scorecard Evaluation Workflow

Scope: $ARGUMENTS

## Step 0 — CCEP Bootstrap

Command: `scorecard` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command scorecard "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command scorecard "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile scorecard --output json`
4. If the ConfirmationGate stops the flow, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.

---

1. `scorecard create --task <id> --from-diff`
2. Complete criteria (reviewer or human)
3. `scorecard regression` (optional)
4. `scorecard record --task <id> --verdict PASS --score 2.5`
5. `scorecard aggregate`

Apply skill `evaluation`.
