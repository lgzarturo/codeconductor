---
name: cc-odd
description: Create or resume an opt-in Delivery Ledger for substantial authorized work.
---

# odd

Invoke as `$cc-odd`. The user request follows the skill mention.

# /cc:odd

## Step 0 — CCEP Bootstrap

```bash
bun run dev ccep parse --command odd "$ARGUMENTS"
bun run dev ccep resolve --command odd "$ARGUMENTS"
bun run dev ccep profile --command odd
```

Create a ledger only after authorization and tracked coordination. Read-only and small work do not create state.

When ODD has verification evidence, include its RDD receipt in the ledger
handoff. On resume, verify it against the workspace before relying on a prior
test or review result. If it is stale, keep the ledger and repeat only the
invalidated verification.
