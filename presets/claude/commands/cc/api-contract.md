---
description: >-
  [cc: alias] Run the API contract workflow for public interface changes,
  compatibility constraints, contract tests, documentation, and review.
---

# API Contract Workflow

API contract request: $ARGUMENTS

## Step 1 — Task Card validation (Task Coach role)

Adopt the **Task Coach** role as defined in `CLAUDE.md`.

The Task Card must classify the task as high risk by default and include the
affected public interface, request/response examples, compatibility notes,
versioning impact, consumer impact, contract tests, and docs acceptance
criteria.

**STOP here. Show the completed Task Card and wait for human confirmation.**

---

## Step 2 — Technical Plan (Architect role)

Adopt the **Architect** role as defined in `CLAUDE.md`.

Define the API contract, validation strategy, compatibility behavior, docs or
OpenAPI changes, and reviewer blocking conditions.

**STOP here. Show the Technical Plan and wait for explicit human approval.**

---

## Step 3 — Implementation (Implementer role)

Adopt the **Implementer** role as defined in `CLAUDE.md`.

Apply the minimal diff, preserve compatible behavior unless explicitly approved
as breaking, and update only the planned files.

---

## Step 4 — Contract Tests (Tester role)

Adopt the **Tester** role as defined in `CLAUDE.md`.

Add or update tests for request shape, response shape, status/error behavior,
and backward compatibility.

---

## Step 5 — Review (Reviewer role)

Adopt the **Reviewer** role as defined in `CLAUDE.md`.

Block on missing contract tests, undocumented breaking changes, or docs/OpenAPI
drift.
