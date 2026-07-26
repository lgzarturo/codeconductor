---
name: cc-openspec
description:
  Run OpenSpec backlog delivery — validate BACKLOG.md, plan TaskCards, orchestrate
  agents by phase, review gate, and update backlog state.
---

# OpenSpec Backlog Workflow

Scope: $ARGUMENTS

Run `npx cc-codeconductor openspec validate` first. If invalid, **STOP**.

1. `openspec scan` — report backlog changes
2. Select READY item (or `$ARGUMENTS` BC-id)
3. `openspec plan <BC-id>` — TaskCards + `openspec/changes/`
4. Loop: `openspec next` → invoke agent (repo-explorer, architect, tester, implementer, reviewer)
5. Reviewer gate — reject → IN_PROGRESS, **STOP**
6. Mark DONE, move to Archive, `openspec scan`

Apply skill `openspec`. Use isolated context between phases. Implementer uses worktree.
