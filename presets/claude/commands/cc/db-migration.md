---
description: >-
  [cc: alias] Run the database migration workflow for schema/data changes,
  operational sequencing, tests, and review.
---

# Database Migration Workflow

Migration request: $ARGUMENTS

## Step 1 — Task Card validation (Task Coach role)

Adopt the **Task Coach** role as defined in `CLAUDE.md`.

The Task Card must classify the task as high risk and include affected schema,
model, and migration files; data backfill needs; deployment ordering;
rollback/forward-fix strategy; lock risk; data risk; and verification commands.

**STOP here. Show the completed Task Card and wait for human confirmation.**

---

## Step 2 — Migration Plan (Architect role)

Adopt the **Architect** role as defined in `CLAUDE.md`.

Define the schema/data plan, operational sequencing, compatibility strategy,
rollback/forward-fix notes, and test approach.

**STOP here. Show the Technical Plan and wait for explicit human approval.**

---

## Step 3 — Implementation (Implementer role)

Adopt the **Implementer** role as defined in `CLAUDE.md`.

Keep model and migration changes together, avoid unrelated refactors, and
preserve the deployment order specified by architect.

---

## Step 4 — Migration Tests (Tester role)

Adopt the **Tester** role as defined in `CLAUDE.md`.

Cover migration-sensitive behavior where the stack supports it, including
existing-data edge cases and rollback/forward-fix notes when automated rollback
tests are not practical.

---

## Step 5 — Review (Reviewer role)

Adopt the **Reviewer** role as defined in `CLAUDE.md`.

Block on missing migration tests, missing data-risk notes, undocumented
deployment sequencing, or model/migration drift.
