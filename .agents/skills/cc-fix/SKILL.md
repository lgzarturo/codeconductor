---
name: cc-fix
description:
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

When the task concerns concrete Jetpack Compose phone layout, component states,
interaction, accessibility, visual behavior, or a requested UI audit, apply skill
`android-ui-design`. Use it during design, test/implementation, and review as
applicable while keeping this workflow's gates and TDD order. Kotlin, Compose,
framework, or dependency presence alone does not activate it; non-UI Android work
stays with the general `android` skill. Audit-only requests remain read-only, and
unavailable visual or emulator checks remain pending rather than claimed complete.


## Step 1 — Task Card validation (task-coach)

Invoke `task-coach` with the bug description above.

task-coach must produce a Task Card that includes:

- A clear statement of actual vs. expected behavior
- Reproduction steps (or a note that they are unknown)
- Risk classification: `low`, `medium`, or `high`
- Scope: which files or modules are likely affected

If reproduction steps are missing, task-coach must ask for them before
classifying risk. A bug without a reproduction path cannot be classified
reliably.

**STOP here. Show the Task Card and wait for human confirmation.**

---

## Step 2 — Route by risk

Read the risk field from the Task Card and follow the corresponding route.

### Low-risk route

Applies when: the bug is isolated to a single component, existing tests cover
the affected code, and no public API or shared state is involved.

Route: `task-coach` → `tester` → `implementer`

Proceed directly to Step 3a.

### Medium or high-risk route

Applies when: the bug touches shared state, a public API, auth or payment paths,
database writes, or the root cause is not yet understood.

Route: `task-coach` → `architect` → `tester` → `implementer` → `reviewer`

Invoke `architect` before implementation. architect must:

- Identify the root cause (or document that it is unknown)
- Define the fix approach and affected files
- Flag any regression risk to adjacent components
- Produce a Technical Plan

**STOP here if high-risk. Show the Technical Plan and wait for human approval
before continuing.**

---

## Step 3a — Implementation, low-risk (implementer)

Invoke `implementer` with the Task Card.
Implementer creates a Git Worktree before touching any file; all edits happen inside it.

implementer must:

1. Locate the defect using the reproduction steps
2. Apply the minimal fix — no unrelated changes
3. Run the test suite
4. Produce an Implementation Summary: root cause, fix applied, files changed

---

## Step 3b — Implementation, medium/high-risk (implementer)

Invoke `implementer` with the approved Technical Plan and the Task Card.
Implementer creates a Git Worktree before touching any file; all edits happen inside it.

implementer must follow the plan exactly. Any deviation requires a new Technical
Plan approval. After implementation, run the full test suite.

---

## Step 4 — Regression tests (tester)

Invoke `tester` for all risk levels.

tester must:

1. Write a regression test that reproduces the original bug (fails before the
   fix, passes after)
2. Verify that existing tests still pass
3. Produce a Coverage Summary: test added, case covered

---

## Step 5 — Review (reviewer) — medium/high-risk only

Invoke `reviewer` with the diff and Task Card.

reviewer produces a Review Report with CRITICAL / WARNING / SUGGESTION findings.
If any CRITICAL findings exist, **STOP**. Do not close the fix until they are
resolved.

---

## Completion

Report: Task Card, Implementation Summary, regression test added, Review Report
(if applicable). The fix is complete only when: the regression test passes, the
full suite passes, and no CRITICAL review findings remain.
