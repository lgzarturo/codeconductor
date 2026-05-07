# Agent Scorecard

## What Is a Scorecard

A Scorecard is the evaluation record for a Deliverable produced by a Conductor
Agent.

It is filled out after the agent completes its work and before the Deliverable
is accepted. It is not a formality. It is the mechanism that closes the feedback
loop: the agent produces output, a human (or a reviewer agent) evaluates it
against the Task Card's acceptance criteria, and the result is recorded.

The Scorecard answers one question: does this Deliverable meet the contract?

Without a Scorecard, the workflow has no measured output. "It looks fine" is not
a verdict. A weighted score against defined criteria is.

---

## Why Measure Deliverables

Agent output quality is not constant. It varies with task complexity, prompt
version, model version, and context length. Without measurement, teams cannot
tell whether a workflow is improving or degrading over time.

The Scorecard enables:

- **Reproducibility audits** — same task type, same agent, same criteria. Are
  scores consistent?
- **Agent Contract improvement** — low scores on a specific criterion signal
  that the Agent Contract (prompt) needs revision.
- **Risk validation** — high-risk tasks scored below threshold must be rejected,
  not merged with reservations.
- **Team accountability** — the evaluator's name is recorded. Vibe-based
  approvals have an author.

---

## Scorecard Template

```markdown
## Agent Scorecard

**Task Card ID:** [project-YYYYMMDD-NNN] **Agent:** [agent name] **Agent
Contract version:** v0.1.0 **Date:** [YYYY-MM-DD] **Evaluator:** [human name or
"self"]

### Criteria

| #   | Criterion                         | Weight | Score (0–3) | Notes |
| --- | --------------------------------- | ------ | ----------- | ----- |
| 1   | Acceptance criteria met           | 30%    |             |       |
| 2   | Minimal diff (no scope creep)     | 20%    |             |       |
| 3   | Tests present and passing         | 20%    |             |       |
| 4   | No regressions introduced         | 15%    |             |       |
| 5   | Code follows project conventions  | 10%    |             |       |
| 6   | Documentation updated if required | 5%     |             |       |

**Score scale:** 0 = not met, 1 = partial, 2 = met, 3 = exceeded

**Weighted score:** [calculated] **Pass threshold:** 2.0

### Verdict

[ ] PASS — deliverable accepted [ ] REVISE — specific issues must be corrected [
] REJECT — route back to task-coach for re-scoping

### Findings

[List specific issues or confirmations per criterion]

### Next step

[What happens after this scorecard]
```

---

## Scoring Guidance

### 1. Acceptance Criteria Met (30%)

Score each acceptance criterion in the Task Card as met or not. This criterion
scores the aggregate.

- **0** — One or more acceptance criteria are not met and cannot be waived.
- **1** — Most criteria are met; one minor criterion is partially addressed.
- **2** — All acceptance criteria are met as written.
- **3** — All criteria are met and the implementation handles edge cases not
  explicitly listed in the card.

This is the heaviest criterion. A score of 0 here makes PASS mathematically
impossible.

### 2. Minimal Diff (20%)

Evaluate whether the agent changed only what the Task Card required.

- **0** — The agent modified files outside the declared scope, introduced
  unrelated changes, or refactored code not mentioned in the card.
- **1** — Minor incidental changes outside scope (e.g., formatting in an
  adjacent function).
- **2** — Changes are limited to the declared scope. No extras.
- **3** — Changes are surgical. Every line modified has a direct mapping to an
  acceptance criterion.

Scope creep at score 0 is grounds for REJECT, not REVISE.

### 3. Tests Present and Passing (20%)

Applies when the Task Card declares `Requires tests: yes`.

- **0** — No tests added, or existing tests are failing after the change.
- **1** — Tests present but do not cover the new behavior or cover it
  superficially (no assertions on the actual behavior).
- **2** — Tests cover the new behavior, pass, and no existing tests are broken.
- **3** — Tests cover the new behavior, edge cases, and error paths. Coverage is
  measurably improved.

When `Requires tests: no`, score this criterion 2 (met by design) and note it.

### 4. No Regressions Introduced (15%)

- **0** — Existing tests fail after the change, or behavior that was working is
  now broken.
- **1** — One test failure that can be explained as a known acceptable change
  (document this in Findings).
- **2** — Full test suite passes. No behavioral regressions observed.
- **3** — Full test suite passes, and the evaluator verified behavior manually
  in at least one integration path.

### 5. Code Follows Project Conventions (10%)

Evaluate against the project's established patterns: naming, package structure,
error handling style, logging conventions.

- **0** — Multiple violations of established conventions.
- **1** — Minor violations; the code works but does not follow the team's style.
- **2** — Code is consistent with the existing codebase conventions.
- **3** — Code is consistent and sets a positive example for the pattern it
  introduces.

### 6. Documentation Updated If Required (5%)

Applies when the Task Card's change affects public API, module boundaries, or
ADR-tracked decisions.

- **0** — Documentation is required and missing.
- **1** — Documentation exists but is incomplete or inaccurate for the change.
- **2** — All required documentation is updated and accurate.
- **3** — Documentation updated and explicitly cross-references related docs or
  ADRs.

When no documentation update is required by the task type, score this criterion
2 (met by design) and note it.

---

## Weighted Score Calculation

```text
weighted_score =
  (score_1 * 0.30) +
  (score_2 * 0.20) +
  (score_3 * 0.20) +
  (score_4 * 0.15) +
  (score_5 * 0.10) +
  (score_6 * 0.05)
```

Maximum possible score: 3.0

Pass threshold: 2.0 (equivalent to "all criteria met" across the board)

---

## Verdicts

**PASS** — Weighted score >= 2.0 and no criterion scored 0. The Deliverable is
accepted. The Task Card status moves to `done`.

**REVISE** — Weighted score >= 1.5 or one criterion scored 0 on a non-critical
criterion (criteria 5 or 6). The agent receives specific findings and must
address them. The Task Card status moves back to `in-progress`.

**REJECT** — Weighted score < 1.5, or criterion 1 scored 0, or criterion 2
scored 0 (scope creep), or criterion 4 scored 0 (regressions). The Deliverable
is not acceptable. Route back to `task-coach` for re-scoping. The current Task
Card is marked `done` with verdict REJECT; a new Task Card is created.

---

## A Note on Honesty

The Scorecard is not a tool for approving work. It is a tool for measuring work.

If a Deliverable is mediocre, the score should reflect that — even if the
deadline is close, even if the agent "tried hard", even if the evaluator wrote
the Agent Contract. A PASS on a score of 1.6 is a lie that compounds.

The feedback loop only works if the input is accurate. Score what you see.
