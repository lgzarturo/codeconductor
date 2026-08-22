---
description:
  Run the full feature workflow — task validation, technical design,
  implementation, testing, review, and documentation.
---

# Feature Workflow

Feature request: $ARGUMENTS

## Step 0 — CCEP Bootstrap

Command: `feature` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command feature "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command feature "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile feature --output json`
4. After planner/intake JSON is available, run: `npx cc-codeconductor ccep evaluate --command feature --input <planner.json> --output json`. If `stop` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.
   Canonical delivery order is test-before-implement whenever both phases apply.

---

## Step 1 — Wayfinding (repo-explorer)

If `graphify-out/graph.json` exists, run `graphify query "$ARGUMENTS"` (and
`graphify path` / `graphify explain` when needed). Then invoke `repo-explorer`
to map modules, conventions, and impact radius. Do not write code in this step.
Record a Repo Map artifact before intake.

---

## Step 2 — Task Card validation (task-coach)

Invoke `task-coach` with the feature description above.

task-coach must produce a complete Task Card before any other agent runs. The
Task Card is ready when it contains: title, type, risk classification, scope,
context, acceptance criteria, and constraints.

If any field is missing or ambiguous, task-coach must ask one clarifying
question at a time and wait for the answer. Do not proceed with an incomplete
Task Card.

**STOP here. Show the completed Task Card and wait for human confirmation before
continuing.**

---

## Step 3 — Technical Plan (architect)

Invoke `architect` with the validated Task Card from Step 1.

architect must produce a Technical Plan that covers:

- Chosen approach and rationale
- Affected files and modules
- Data model changes (if any)
- API contract changes (if any)
- Identified risks and mitigations
- Open questions that require a human decision

**STOP here. Show the Technical Plan and wait for explicit human approval. Do
not invoke implementer until the plan is approved.**

---

## Step 4 — Test coverage (tester)

Invoke `tester` with the Implementation Summary and the Task Card.

tester must:

1. Write or extend failing tests for the new behavior before implementation (RED)
2. Ensure all acceptance criteria from the Task Card have at least one test
3. Run the full test suite and confirm it passes
4. Produce a Coverage Summary: test files added or modified, cases covered

---

## Step 5 — Implementation (implementer)

Invoke `implementer` with the approved Technical Plan and the Task Card.
Implementer creates a Git Worktree before touching any file; all edits happen inside it.

implementer must:

1. Read the Technical Plan before touching any file
2. Apply the minimal diff — only what the plan specifies
3. Run the project test suite and make the previously written failing tests pass
4. Produce an Implementation Summary: what changed, which files, how to verify
   locally

---

## Step 6 — Code review (reviewer)

Invoke `reviewer` with the complete diff and the Task Card.

reviewer must produce a Review Report with findings categorized as:

- CRITICAL — must be fixed before merge
- WARNING — must be resolved before merge
- SUGGESTION — optional improvement

If any CRITICAL findings exist, **STOP and report them**. Do not proceed until
they are resolved and re-reviewed.

---

## Step 7 — Documentation (docs)

Invoke `docs` only if any of the following changed:

- A public API endpoint was added or modified
- A public interface or module was introduced
- Behavior visible to end users changed

docs must update: README (if applicable), OpenAPI spec (if applicable),
CHANGELOG (always), ADR (if an architectural decision was made).

---

## Completion

Report the following to the human:

- Task Card (final)
- Technical Plan (approved)
- Implementation Summary
- Coverage Summary
- Review Report (all findings resolved)
- List of documentation files updated (if any)

The feature is complete only when: all tests pass, no CRITICAL review findings
remain, and documentation reflects the implemented behavior.
