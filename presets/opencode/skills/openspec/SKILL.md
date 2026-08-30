---
name: openspec
description:
  Guides agents through OpenSpec delivery from BACKLOG.md (validate, analyze,
  test-before-implement, scorecard, archive). Use when running /cc-openspec,
  /cc:openspec, or delivering an existing backlog item. Authoring BACKLOG.md
  is skill backlog, not this skill.
---

# OpenSpec delivery

## Overview

This skill delivers an existing `BACKLOG.md` item. It is a workflow with CLI
gates, not a reference doc. Specs describe WHAT; `design.md` describes HOW.

## When to Use

- `/cc-openspec` or `openspec next` / `plan` / `done` / `archive`
- An item is `READY` or later and must move through the state machine

**NOT** for creating `BACKLOG.md` (use skill `backlog`) or for stack-specific
coding rules.

## Process

Local CLI is `bun run dev`. Published package is `npx cc-codeconductor`.

1. `openspec validate` — must pass before delivery.
2. `openspec plan BC-xxx` if the item is not yet `PLANNED`.
3. `openspec analyze --output json` — CRITICAL findings exit 1. Do not implement.
4. Phases: discover (`repo-explorer`) → design (`architect`) → test (`tester`) →
   implement (`implementer`) → review (`reviewer`). If Global `TDD required: yes`,
   test runs before implement.
5. `openspec done` on test/implement requires `captureTddSuiteEvidence`. Handmade
   evidence JSON is rejected.
6. `scorecard create --task BC-xxx --from-diff` then record a verdict.
7. `openspec archive` only after human review when `Review required: yes` and
   the scorecard is PASS.

Status machine: `TODO` → `READY` → `PLANNED` → `IN_PROGRESS` → `REVIEW` → `DONE`
→ Archive. `BLOCKED` returns to `READY`. Reviewer rejection: `REVIEW` →
`IN_PROGRESS`.

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| Validate is bureaucracy | `openspec validate` is the gate. Skipping it is a defect. |
| I'll add tests after green | Global TDD required means tester before implementer. |
| I'll write the evidence JSON myself | Handmade TDD JSON is rejected. Use the verification runner. |
| The item is small; skip analyze | `openspec analyze` CRITICAL still stops implement. |

## Red Flags

- Implementing while analyze reports CRITICAL
- Archive without a PASS scorecard when review is required
- Acceptance like "improve UX" with no measurable check

## Verification

- [ ] `openspec validate` exit 0
- [ ] `openspec analyze --output json` has no CRITICAL
- [ ] TDD evidence from the runner when TDD is required
- [ ] `scorecard create --from-diff` recorded
- [ ] Suite check (optional): `bun run dev scorecard suite-run --suite workflow-gates`
