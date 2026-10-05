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

- `/cc-openspec` or `openspec plan` / `next` / `done` / `sync` / `verify` / `archive`
- An item is `READY` or later and must move through the state machine

**NOT** for creating `BACKLOG.md` (use skill `backlog`) or for stack-specific
coding rules.

## Process

The CLI is always `npx cc-codeconductor`; never `npx cc-codeconductor` in a consumer project.

1. `openspec validate` — must pass before delivery. If you reached this
   workflow on your own (the user did not ask for OpenSpec) and there is no
   `BACKLOG.md` / `openspec/` root, answer normally instead — never scaffold
   one as a side effect.
2. `openspec plan BC-xxx` if the item is not yet `PLANNED`. Planning only: it
   writes TaskCards plus proposal/design/tasks/specs under
   `openspec/changes/<slug>/` and stops. Never implement in this step.
3. Review the plan before `start`: read proposal → delta specs → tasks, in that
   order, and confirm intent, scope, testable FR/SC, and edge-case scenarios.
   Fix the Markdown directly or ask for revisions — code comes later.
4. `openspec analyze --output json` — CRITICAL findings exit 1. Do not implement.
5. Phases: discover (`repo-explorer`) → design (`architect`) → test (`tester`) →
   implement (`implementer`) → review (`reviewer`). If Global `TDD required: yes`,
   test runs before implement. Discover is read-only: it never writes code.
6. `openspec done` on test/implement needs runner evidence: run
   `npx cc-codeconductor tdd capture --task <cardId> --phase red|green --command "<test command>"`
   first (RED on the test card, GREEN on the implement card). Handmade evidence JSON is
   rejected. It is `ev-tdd-*` evidence, not an RDD receipt (`ev-rdd-*`, `rdd verify`).
   `done` ticks that card's `tasks.md` boxes and keeps your edits; the implementer ticks
   any other box it adds (`- [ ]` → `- [x]`, only `x`/`X` counts). `archive` fails while
   boxes stay unchecked (override: `--allow-unchecked`).
7. When implementation reveals a design problem, pause and reconcile the planning
   artifacts first — in any direction (a later artifact may force revising an
   earlier one). Planning artifacts only in that step, never code; confirm each
   edit. If the item's intent changed rather than its details, open a fresh item
   with `/cc-backlog` (`/cc:backlog`) instead of warping this one.
8. `openspec verify --output json` — advisory pre-archive checklist
   (`archiveReady` plus Completeness/Correctness/Coherence issues). Optional:
   `openspec sync` merges delta specs into `openspec/specs/` without closing.
9. `scorecard create --task BC-xxx --from-diff` then record a verdict.
10. `openspec archive` only after human review when `Review required: yes` and
    the scorecard is PASS. Archive re-checks planning artifacts and analyze
    CRITICALs, and fails on unchecked `tasks.md` boxes (override: `--allow-unchecked`), ticks the BACKLOG acceptance criteria.

Status machine: `TODO` → `READY` → `PLANNED` → `IN_PROGRESS` → `REVIEW` → `DONE`
→ Archive. `BLOCKED` returns to `READY`. Reviewer rejection: `REVIEW` →
`IN_PROGRESS`.

`openspec status --output json` also reports artifact presence, `tasks.md`
checkbox progress, and `nextSteps` for the next CLI call.

## Web interface scope

When the task concerns web layout, component states, feedback, motion, or a
requested UI audit, apply skill `web-design-engineering` from the installed skill
library. Use it during intake/discovery, design, test/implement, and review as
applicable; keep this workflow’s gates and TDD order. Framework presence alone
does not activate it; backend-only and native mobile work are excluded. Record
required visual checks as pending when unavailable. Keep findings in the existing
Review Report: contract failures in Spec Axis, technical issues in existing
subchecks, and aesthetic preferences as suggestions; do not add an axis.

## Android phone interface scope

When an item concerns concrete Jetpack Compose phone layout, component states,
interaction, accessibility, visual behavior, or a requested UI audit, apply skill
`android-ui-design` throughout discover, design, test/implement, and review. Keep
OpenSpec gates and TDD order. Kotlin, Compose, framework, or dependency presence
alone does not activate it; non-UI Android work stays with `android`. Keep audit-only
delivery read-only and record unavailable visual or emulator evidence as pending.

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| Validate is bureaucracy | `openspec validate` is the gate. Skipping it is a defect. |
| I'll add tests after green | Global TDD required means tester before implementer. |
| I'll write the evidence JSON myself | Handmade TDD JSON is rejected. Use the verification runner. |
| The item is small; skip analyze | `openspec analyze` CRITICAL still stops implement. |
| The plan is generated; skip reading it | Read proposal → specs → tasks before `start`. Generated is not reviewed. |
| I'll fix the spec after shipping | Reconcile planning artifacts before continuing to implement. |

## Red Flags

- Implementing while analyze reports CRITICAL
- Starting cards before reading the generated plan
- Archive without a PASS scorecard when review is required
- Archive while `openspec verify` reports CRITICAL
- Acceptance like "improve UX" with no measurable check

## Verification

- [ ] `openspec validate` exit 0
- [ ] Plan reviewed (proposal → specs → tasks) before `start`
- [ ] `openspec analyze --output json` has no CRITICAL
- [ ] TDD evidence from the runner when TDD is required
- [ ] `tasks.md` boxes ticked as FRs land
- [ ] `openspec verify --output json` checked before archive
- [ ] `scorecard create --from-diff` recorded
- [ ] Suite check (optional): `npx cc-codeconductor scorecard suite-run --suite workflow-gates`
