---
description: >-
  [cc: alias] Run authorized defensive security work — domain skill selection,
  authorization gate, risk-based routing, and optional Reviewer.
---

# Security Workflow

Security request: $ARGUMENTS

Provide the following information in $ARGUMENTS:

- Objective (what must be assessed, hardened, or investigated)
- Domain (recon, vuln-assessment, web, cloud, IR, hunting, GRC, …)
- Authorization (who authorized the work, systems in scope, time window)
- Risk (`low`, `medium`, or `high`)
- Scope (repos, environments, assets that are in and out of bounds)

Do not proceed without an authorization statement. This workflow is defensive
and owner-authorized only. Do not produce exploit payloads, malware, or attack
procedures.

---

## Step 0 — CCEP Bootstrap

Command: `security` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command security "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command security "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile security --output json`
4. After planner/intake JSON is available, run: `npx cc-codeconductor ccep evaluate --command security --input <planner.json> --output json`. If `stop` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.
   Canonical delivery order is test-before-implement whenever both phases apply.

---

## Step 1 — Wayfinding (repo-explorer)

If `graphify-out/graph.json` exists, run `graphify query "$ARGUMENTS"` (and
`graphify path` / `graphify explain` when needed). Then invoke `repo-explorer`
to map modules, conventions, and impact radius. Do not write code in this step.
Record a Repo Map artifact before intake. Load the matching `security-*` skill
for the named domain (see `.claude/skills/security-*/SKILL.md`). Keep the OWASP
`security` skill for application-security reviews.

---

## Step 2 — Task Card validation (Task Coach role)

Adopt the **Task Coach** role as defined in `CLAUDE.md`.

Produce a Task Card that includes:

- Objective
- Domain (which `security-*` skill applies)
- Authorization (approver, systems, window) — refuse if missing
- Risk classification: `low`, `medium`, or `high`
- Scope: in-bounds vs out-of-bounds assets

**STOP here. Show the Task Card and wait for human confirmation.**

---

## Step 3 — Route by risk

Read the risk field from the Task Card and follow the corresponding route.

### Low-risk route

Applies when: the work is an isolated defensive check, existing tests cover the
affected code, and no auth, secrets, or production access is involved.

Route: Task Coach → Tester → Implementer

Proceed to tests, then implementation. Do not require Reviewer.

### Medium or high-risk route

Applies when: the work touches auth, secrets, production, shared security
controls, or the root cause is not yet understood.

Route: Task Coach → Architect → Tester → Implementer → Reviewer

On **high** risk, also invoke `security-reviewer` before Reviewer. Architect
must produce a Technical Plan.

**STOP here if high-risk. Show the Technical Plan and wait for human approval
before continuing.**

---

## Step 4 — Regression tests (Tester role)

Adopt the **Tester** role. Write or extend tests that fail before the hardening
(RED) and pass after. Do not skip assertions.

---

## Step 5 — Implementation (Implementer role)

Adopt the **Implementer** role. Create a Git Worktree before touching any file.
Apply only the approved defensive change. No exploit code.

---

## Step 6 — Review (Reviewer role) — medium/high-risk only

Adopt the **Reviewer** role. Produce a Review Report with CRITICAL / WARNING /
SUGGESTION findings. If any CRITICAL findings exist, **STOP**.

---

## Completion

Report: Task Card, Implementation Summary, regression test added, Review Report
(if applicable). The work is complete only when tests pass and no CRITICAL
review findings remain.
