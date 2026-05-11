---
description: >-
  [cc: alias] Run the full feature workflow — task validation, technical design,
  implementation, testing, review, and documentation.
---

# Feature Workflow

Feature request: $ARGUMENTS

---

## Step 1 — Task Card validation (Task Coach role)

Adopt the **Task Coach** role as defined in `CLAUDE.md`.

Produce a complete Task Card. The Task Card is ready when it contains: title,
type, risk classification, scope, context, acceptance criteria, and constraints.

If any field is missing or ambiguous, ask one clarifying question at a time and
wait for the answer. Do not proceed with an incomplete Task Card.

**STOP here. Show the completed Task Card and wait for human confirmation before
continuing.**

---

## Step 2 — Technical Plan (Architect role)

Adopt the **Architect** role as defined in `CLAUDE.md`.

Produce a Technical Plan that covers:

- Chosen approach and rationale
- Affected files and modules
- Data model changes (if any)
- API contract changes (if any)
- Identified risks and mitigations
- Open questions that require a human decision

**STOP here. Show the Technical Plan and wait for explicit human approval. Do
not proceed to implementation until the plan is approved.**

---

## Step 3 — Implementation (Implementer role)

Adopt the **Implementer** role as defined in `CLAUDE.md`.

Use the approved Technical Plan and the Task Card from the steps above.
Implementer creates a Git Worktree before touching any file; all edits happen inside it.

1. Read the Technical Plan before touching any file.
2. Apply the minimal diff — only what the plan specifies.
3. Run the project test suite after implementation.
4. Produce an Implementation Summary: what changed, which files, how to verify
   locally.

---

## Step 4 — Test coverage (Tester role)

Adopt the **Tester** role as defined in `CLAUDE.md`.

Use the Implementation Summary and the Task Card.

1. Write or extend tests to cover the new behavior.
2. Ensure all acceptance criteria from the Task Card have at least one test.
3. Run the full test suite and confirm it passes.
4. Produce a Test Report: test files added or modified, cases covered.

---

## Step 5 — Code review (Reviewer role)

Adopt the **Reviewer** role as defined in `CLAUDE.md`.

Use the complete diff and the Task Card.

Produce a Review Report with findings categorized as CRITICAL, WARNING, or
SUGGESTION.

If any CRITICAL findings exist, **STOP and report them**. Do not proceed until
they are resolved and the diff is re-reviewed.

---

## Step 6 — Documentation (Docs role)

Adopt the **Docs** role as defined in `CLAUDE.md`.

Invoke this step only if any of the following changed:

- A public API endpoint was added or modified
- A public interface or module was introduced
- Behavior visible to end users changed

Update: README (if applicable), OpenAPI spec (if applicable), CHANGELOG
(always), ADR (if an architectural decision was made).

---

## Completion

Report the following:

- Task Card (final)
- Technical Plan (approved)
- Implementation Summary
- Test Report
- Review Report (all findings resolved)
- List of documentation files updated (if any)

The feature is complete only when: all tests pass, no CRITICAL review findings
remain, and documentation reflects the implemented behavior.
