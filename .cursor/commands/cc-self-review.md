---
description: >-
  [INTERNAL] Self-review of the CodeConductor product (security, implementation,
  workflow, features, mental model). Not part of consumer workflows.
  Alias of /cc:self-review.
---

# CodeConductor Self-Review

Scope: $ARGUMENTS

**INTERNAL ONLY.** This command reviews *this* repository (the CodeConductor
product). It must **not** use CCEP bootstrap, must **not** route through
Conductor Agents as a shipped workflow, and must **never** be copied into
`presets/`.

## Instructions

1. Load and follow the skill at `skills/cc-self-review/SKILL.md` (canonical).
2. If a Cursor stub exists, also honor `.cursor/skills/cc-self-review/SKILL.md`.
3. Pass `$ARGUMENTS` as the review scope (see skill: empty, `security`,
   `product`, `implementation`, `full`, or file paths).
4. Produce the Self-Review Report in the conversation; write
   `docs/internal/YYYY-MM-DD-cc-self-review.md` only if the user asks.
5. Do not implement fixes unless the user explicitly requests follow-up work.

## Local verification hints

```bash
bun run typecheck
bun run dev help
graphify query "CodeConductor architecture security CLI"
```
