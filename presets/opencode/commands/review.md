---
description:
  Run a structured code review — produces a Review Report with CRITICAL,
  WARNING, and SUGGESTION findings; CRITICAL findings block merge.
---

# Code Review Workflow

Review target: $ARGUMENTS

Specify what to review. Accepted formats:

- A branch name: `feature/my-branch`
- A file or set of files: `src/api/UserController.kt`
- A pull request reference: `PR #42`
- Empty — defaults to the current working diff (`git diff`)

---

## Step 1 — Diff collection

Before invoking `reviewer`, collect the diff for the specified target.

If $ARGUMENTS is empty or not provided:

- Use `git diff HEAD` as the review target

If $ARGUMENTS is a branch name:

- Use `git diff main...$ARGUMENTS` (or `develop` if main is not the base)

If $ARGUMENTS is a PR reference:

- Retrieve the PR diff and the PR description for context

If $ARGUMENTS is a file path:

- Use `git diff HEAD -- $ARGUMENTS`

Show the diff summary (files changed, lines added/removed) before invoking
reviewer.

---

## Step 2 — Code review (reviewer)

Invoke `reviewer` with:

- The full diff
- The Task Card or PR description (if available)
- The target specification from $ARGUMENTS

reviewer must evaluate the diff against the following checklist:

**Correctness**

- Does the implementation match the stated intent?
- Are there logic errors, off-by-one errors, or unhandled edge cases?

**Architecture alignment**

- Does the change follow existing module boundaries?
- Does it introduce unplanned coupling or layering violations?

**Security**

- Are inputs validated before use?
- Is there any credential, token, or secret in the diff?
- Are there SQL injection, XSS, or injection risks?

**Performance**

- Does the change introduce N+1 queries, blocking I/O, or O(n^2) loops?

**Test coverage**

- Do tests exist for the new or changed behavior?
- Are assertions meaningful (not just checking that no exception is thrown)?

**Documentation**

- Are public interfaces documented?
- Is CHANGELOG updated if behavior changed?

---

## Step 3 — Review Report

reviewer produces a structured Review Report with findings in three categories:

```markdown
## Review Report

### CRITICAL

[Findings that must be fixed before merge. Each finding includes:

- Location (file:line)
- Description of the problem
- Suggested resolution]

### WARNING

[Findings that should be resolved before merge but are not blockers in
exceptional cases with human approval. Same format as CRITICAL.]

### SUGGESTION

[Optional improvements — style, readability, future-proofing. These do not block
merge.]

### Summary

- Files reviewed: N
- Total findings: N (X critical, Y warnings, Z suggestions)
- Merge recommendation: APPROVED | BLOCKED
```

---

## Step 4 — Merge decision

If any CRITICAL findings exist:

- The Review Report status is **BLOCKED**
- Report all CRITICAL findings to the human
- Do not proceed until each CRITICAL finding is resolved
- After resolution, invoke `/review` again on the same target

If no CRITICAL findings exist:

- The Review Report status is **APPROVED**
- Report any WARNINGs and SUGGESTIONs for human awareness
- The human makes the final merge decision

---

## Completion

Deliver the complete Review Report. Never summarize or omit findings. Every
finding must include a location and an actionable description.
