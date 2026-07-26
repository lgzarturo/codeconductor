---
description:
  Evaluate deliverable quality — scorecard, outcome tracking, regression checklist.
---

# Scorecard Evaluation Workflow

Scope: $ARGUMENTS

1. `scorecard create --task <id> --from-diff`
2. Complete criteria (reviewer or human)
3. `scorecard regression` (optional)
4. `scorecard record --task <id> --verdict PASS --score 2.5`
5. `scorecard aggregate`

Apply skill `evaluation`.
