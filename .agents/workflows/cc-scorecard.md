---
name: cc-scorecard
description:
  Evaluate deliverable quality — scorecard, outcome tracking, regression checklist.
---

# Scorecard Evaluation Workflow

Scope: $ARGUMENTS

1. `npx cc-codeconductor scorecard create --task <id> --from-diff`
2. Complete criteria per docs/agent-scorecard.md
3. `scorecard regression` if needed
4. `scorecard record` with verdict and optional cost/tokens
5. `scorecard aggregate`

Apply skill `evaluation`.
