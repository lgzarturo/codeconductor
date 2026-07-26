---
name: openspec
description:
  OpenSpec backlog format, state machine, and delivery workflow for CodeConductor.
  Use when running /cc-openspec or editing BACKLOG.md.
---

# OpenSpec / BACKLOG Skill

## BACKLOG.md contract

`BACKLOG.md` at repo root is the operational queue. Required sections:

- `## Global` — Product, Strategy, Policy, Review required, TDD required
- `## Items` — active backlog entries
- `## Archive` — completed entries (do not re-execute)

Each item: `### BC-001 | Short title` with Priority (P0–P3), Status, Type, Depends on, Description, Scope, Out of scope, Acceptance (measurable checklist).

## Status machine

`TODO` → `READY` → `PLANNED` → `IN_PROGRESS` → `REVIEW` → `DONE` → Archive

## CLI

`openspec validate | scan | plan | status | next`

## Agent phases

discover → repo-explorer, design → architect, test → tester, implement → implementer, review → reviewer.

TDD required: test before implement.
