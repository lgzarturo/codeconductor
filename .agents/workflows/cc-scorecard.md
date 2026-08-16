---
name: cc-scorecard
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
4. After planner/intake JSON is available, run: `npx cc-codeconductor ccep evaluate --command scorecard --input <planner.json> --output json`. If `stop` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.
   Canonical delivery order is test-before-implement whenever both phases apply.

---

1. `npx cc-codeconductor scorecard create --task <id> --from-diff`
2. Complete criteria per docs/agent-scorecard.md
3. `scorecard regression` if needed
4. `scorecard record` with verdict and optional cost/tokens
5. `scorecard aggregate`

Apply skill `evaluation`.
