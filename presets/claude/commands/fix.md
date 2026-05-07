---
description: >-
  Run the bug fix workflow — risk-based routing through task validation,
  implementation, testing, and optional review.
---

# Bug Fix Workflow

Bug description: $ARGUMENTS

Provide the following information in $ARGUMENTS:

- What is the incorrect behavior (actual)
- What is the expected behavior
- Steps to reproduce
- Environment or version where the bug occurs (if known)
- Any relevant error messages or stack traces

---

## Step 1 — Task Card validation (Task Coach role)

Adopt the **Task Coach** role as defined in `CLAUDE.md`.

Produce a Task Card that includes:

- A clear statement of actual vs. expected behavior
- Reproduction steps (or a note that they are unknown)
- Risk classification: `low`, `medium`, or `high`
- Scope: which files or modules are likely affected

If reproduction steps are missing, ask for them before classifying risk. A bug
without a reproduction path cannot be classified reliably.

**STOP here. Show the Task Card and wait for human confirmation.**

---

## Step 2 — Route by risk

Read the risk field from the Task Card and follow the corresponding route.

### Low-risk route

Applies when: the bug is isolated to a single component, existing tests cover
the affected code, and no public API or shared state is involved.

Route: Task Coach → Implementer → Tester

Proceed directly to Step 3a.

### Medium or high-risk route

Applies when: the bug touches shared state, a public API, auth or payment
paths, database writes, or the root cause is not yet understood.

Route: Task Coach → Architect → Implementer → Tester → Reviewer

Adopt the **Architect** role before implementation. Architect must:

- Identify the root cause (or document that it is unknown)
- Define the fix approach and affected files
- Flag any regression risk to adjacent components
- Produce a Technical Plan

**STOP here if high-risk. Show the Technical Plan and wait for human approval
before continuing.**

---

## Step 3a — Implementation, low-risk (Implementer role)

Adopt the **Implementer** role as defined in `CLAUDE.md`. Use the Task Card.

1. Locate the defect using the reproduction steps.
2. Apply the minimal fix — no unrelated changes.
3. Run the test suite.
4. Produce an Implementation Summary: root cause, fix applied, files changed.

---

## Step 3b — Implementation, medium/high-risk (Implementer role)

Adopt the **Implementer** role as defined in `CLAUDE.md`. Use the approved
Technical Plan and the Task Card.

Follow the plan exactly. Any deviation requires a new Technical Plan approval.
After implementation, run the full test suite.

---

## Step 4 — Regression tests (Tester role)

Adopt the **Tester** role as defined in `CLAUDE.md`. Apply for all risk levels.

1. Write a regression test that reproduces the original bug (fails before the
   fix, passes after).
2. Verify that existing tests still pass.
3. Produce a Test Report: test added, case covered.

---

## Step 5 — Review (Reviewer role) — medium/high-risk only

Adopt the **Reviewer** role as defined in `CLAUDE.md`. Use the diff and Task
Card.

Produce a Review Report with CRITICAL / WARNING / SUGGESTION findings. If any
CRITICAL findings exist, **STOP**. Do not close the fix until they are resolved.

---

## Completion

Report: Task Card, Implementation Summary, regression test added, Review Report
(if applicable).

The fix is complete only when: the regression test passes, the full suite
passes, and no CRITICAL review findings remain.
