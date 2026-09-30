---
description: Create or resume an opt-in Delivery Ledger for substantial authorized work.
---

# /cc:odd

## Step 0 — CCEP Bootstrap

```bash
bun run dev ccep profile odd --output json
bun run dev ccep compile --command odd --phase <phase-id> "$ARGUMENTS" --view prompt --output json
```

Pass each subagent only the compiled `prompt` for its phase.

Create a ledger only after authorization and tracked coordination. Read-only and small work do not create state.
