---
description: >-
  [cc: alias] Run a structured code review — produces a Review Report with
  CRITICAL, WARNING, and SUGGESTION findings; CRITICAL findings block merge.
---

# Code Review Workflow

Review target: $ARGUMENTS

Specify what to review. Accepted formats:

- A branch name: `feature/my-branch`
- A file or set of files: `src/api/UserController.kt`
- A pull request reference: `PR #42`
- Empty — defaults to the current working diff (`git diff`)

---

## Step 0 — CCEP Bootstrap

Command: `review` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command review "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command review "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile review --output json`
4. After planner/intake JSON is available, run: `npx cc-codeconductor ccep evaluate --command review --input <planner.json> --output json`. If `stop` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.

---

## Step 1 — Diff collection

Before adopting the Reviewer role, collect the diff for the specified target.

If $ARGUMENTS is empty or not provided:

- Use `git diff HEAD` as the review target.

If $ARGUMENTS is a branch name:

- Use `git diff main...$ARGUMENTS` (or `develop` if main is not the base).

If $ARGUMENTS is a PR reference:

- Retrieve the PR diff and the PR description for context.

If $ARGUMENTS is a file path:

- Use `git diff HEAD -- $ARGUMENTS`.

Show the diff summary (files changed, lines added/removed) before proceeding.

---

## Step 2 — Code review (Reviewer role)

Invoke the `reviewer` subagent via the Task tool.

Evaluate the diff against the following checklist:

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

- Does the change introduce N+1 queries, blocking I/O, or O(n²) loops?

**Test coverage**

- Do tests exist for the new or changed behavior?
- Are assertions meaningful (not just checking that no exception is thrown)?

**Documentation**

- Are public interfaces documented?
- Is CHANGELOG updated if behavior changed?

---

## Step 3 — Review Report

Produce a structured Review Report with findings in three categories:

```markdown
## Review Report

### CRITICAL
[Findings that must be fixed before merge — file:line, description, suggested resolution]

### WARNING
[Findings that should be resolved before merge — same format as CRITICAL]

### SUGGESTION
[Optional improvements — style, readability, future-proofing. These do not block merge.]

### Summary
- Files reviewed: N
- Total findings: N (X critical, Y warnings, Z suggestions)
- Merge recommendation: APPROVED | BLOCKED
```

---

## Step 4 — Merge decision

If any CRITICAL findings exist:

- The Review Report status is **BLOCKED**.
- Report all CRITICAL findings.
- Do not proceed until each CRITICAL finding is resolved.
- After resolution, run `/review` again on the same target.

If no CRITICAL findings exist:

- The Review Report status is **APPROVED**.
- Report any WARNINGs and SUGGESTIONs for human awareness.
- The human makes the final merge decision.

---

## Completion

Deliver the complete Review Report. Never summarize or omit findings.

---

## Step 5 — Scorecard and outcome

```bash
npx cc-codeconductor scorecard create --from-diff --agent reviewer
npx cc-codeconductor scorecard record --verdict PASS|REVISE|REJECT --score <weighted>
npx cc-codeconductor scorecard regression
```

Map merge recommendation to scorecard verdict. Record outcome for trend tracking.
