---
name: openspec
description:
  OpenSpec backlog format, state machine, and delivery workflow for CodeConductor.
  Use when running /cc-openspec or editing BACKLOG.md.
---

# OpenSpec / BACKLOG Skill

See `presets/agy/skills/openspec/SKILL.md` for full rules.

`BACKLOG.md` at repo root is the FIFO queue. Run `npx cc-codeconductor openspec validate` before delivery.

Phases: discover → design → test (if TDD) → implement → review.
