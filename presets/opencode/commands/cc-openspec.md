---
description:
  Run OpenSpec backlog delivery — validate BACKLOG.md, plan TaskCards, orchestrate
  agents by phase, review gate, and update backlog state.
---

# OpenSpec Backlog Workflow

Scope: $ARGUMENTS

---

## Step 0 — Validate (mandatory gate)

Run `npx cc-codeconductor openspec validate`. If invalid, show errors and recommendations, then **STOP**.

---

## Step 0 — CCEP Bootstrap

Command: `openspec` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command openspec "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command openspec "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile openspec --output json`
4. After planner/intake JSON is available, run: `npx cc-codeconductor ccep evaluate --command openspec --input <planner.json> --output json`. If `stop` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.
   Canonical delivery order is test-before-implement whenever both phases apply.

---

## Step 1 — Scan

Run `npx cc-codeconductor openspec scan`. Report new, modified, and closed items.

---

## Step 2 — Select item

Use `$ARGUMENTS` BC-id or `npx cc-codeconductor openspec status` for next READY item. **STOP** if none.

---

## Step 3 — Plan

Run `npx cc-codeconductor openspec plan <BC-id>`. Show TaskCards and `openspec/changes/` path.

---

## Step 4 — Execute loop

For each pending card: `npx cc-codeconductor openspec next`, then invoke the listed agent:

- discover → `repo-explorer`
- design → `architect`
- test → `tester`
- implement → `implementer`
- review → `reviewer`

Use isolated context (`/clear` between phases). Implementer uses a git worktree.

---

## Step 5 — Review gate

Reviewer approves or rejects against acceptance criteria. Reject → `IN_PROGRESS`, **STOP**.

---

## Step 6 — Update

Mark DONE, move to Archive in BACKLOG.md, run `openspec scan`.

Apply skill `openspec` for format and state rules.
