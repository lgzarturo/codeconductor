---
name: backlog
description: >
  Author BACKLOG.md and OpenSpec change folders for CodeConductor.
  Trigger: /cc-backlog, /cc:backlog, creating or appending backlog items,
  writing BACKLOG.md, or preparing work for /cc-openspec.
---

# Backlog authoring

Use this skill to **create or append** `BACKLOG.md` and generate OpenSpec
change docs. Delivery of an existing item is `/cc-openspec` (skill `openspec`).

## BACKLOG.md contract

Canonical template: `presets/templates/BACKLOG.md` (or the installed copy).
Required sections:

- `## Global` — Product, Strategy, Policy, Review required, TDD required
- `## Items` — active entries
- `## Archive` — completed entries (never re-execute; never rewrite)

Each item: `### BC-001 | Short title` with Priority (P0–P3), Status, Type,
Depends on, Description, Scope, Out of scope, Acceptance (measurable checklist).

Status after grilling: `READY`. `openspec plan` then moves the item to `PLANNED`.

## Create vs append

- **No `BACKLOG.md`:** create it from the template. Set Global `Product` from
  `package.json` `name` when present.
- **File exists:** append new `### BC-xxx` blocks under `## Items`. Do not
  rewrite `## Global` or `## Archive`.

Next ID = max numeric suffix across Items and Archive, plus one, zero-padded
to three digits (`BC-013` after `BC-012`).

## Wayfinding (before Scope)

If `graphify-out/graph.json` exists, run `graphify query "<objectives>"` (and
`graphify path` / `graphify explain` when needed). Then invoke `repo-explorer`.
Scope must name real files or modules. Do not write `BACKLOG.md` in this step.

## Grilling (before write)

Invoke `task-coach`. One grilling question per assumption. Reject vague
acceptance ("improve UX", "fix bugs"). Criteria must be measurable (same rules
as `openspec validate` / `VAGUE_ACCEPTANCE`).

Unresolved questions go in `questionsForUser`. Run `ccep evaluate --command
backlog`. If `stop` is true, **STOP** and wait for the human.

Do not write items until the gate passes.

## Validate loop

After writing:

```bash
npx cc-codeconductor openspec validate
```

Local CodeConductor dogfood: `bun run dev openspec validate`.

If invalid: list errors and recommendations, show the canonical structure,
fix the file, re-validate. Do not plan until valid.

## Plan new items only

For each **new** `BC-xxx` this run:

```bash
npx cc-codeconductor openspec plan BC-xxx
```

That writes `openspec/changes/<slug>/` (`proposal.md`, `design.md`, `tasks.md`,
`specs/`). Then tell the user to run `/cc-openspec` (optionally with the ID).

## Local artifacts — do not version

In consumer projects these paths are gitignored (see `init`):

- `BACKLOG.md`
- `openspec/`
- `.codeconductor/openspec-state.json`

Do **not** `git add` them. Do not edit `openspec-state.json` by hand.

## Delivery

Format and state machine: skill `openspec`. Authoring is this skill.
