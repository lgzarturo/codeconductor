---
name: test-freeze-gate
description: >-
  Use when a workflow must prove its specs and tests did not move under it:
  SHA-256-freeze specs/ and tests/ into a lock file, re-verify the freeze
  before every gate, and abort on any single-byte difference unless the
  mutation-testing HANDS_OFF protocol authorized the change.
---

# Test-Freeze Gate — Frozen Specs/Tests → Re-verify → Abort or Pass

Scope: $ARGUMENTS

Describe what freeze you want to enforce. Include:

- The task id the lock belongs to (lock lives at
  `.codeconductor/tasks/<task_id>.lock`)
- The frozen file scope (`specs/` + `tests/`, or an explicit subset)
- The gate this freeze protects (TDD phase, review, merge)
- Whether a `mutation_testing` HANDS_OFF handover is active for this gate

---

## Contract

The frozen specification and its tests are the **immutable contract** of the
gate. No result passes unless the bytes that produced it are byte-identical
to the bytes that were frozen. The loop is closed:

```
[human approves spec+tests] ──> [Freeze: SHA-256 lock]
                                         │
┌────────────────────────────────────────┘
▼
[gate runs] ──> [recompute hash] ── match ──> [Pass]
                       │
                    mismatch ──> [Abort: Specification Gaming]
```

Role mapping onto Conductor Agents (AGENTS.md):

| Workflow role   | Conductor Agent          | Deliverable                              |
| --------------- | ------------------------ | ---------------------------------------- |
| `freeze_author` | `contract-builder`       | Approved `specs/` + `tests/` to freeze   |
| `gate_runner`   | `tester` → `implementer` | Gate evidence produced under the freeze  |
| `freeze_judge`  | `reviewer`               | Binary verdict (PASS/ABORT) with scoring |

## Stage 1 — Freeze (`freeze_author` / contract-builder)

Freeze the approved specs and tests behind a SHA-256 lock before any gated
work starts:

```bash
shasum -a 256 specs/<task>.feature tests/ > .codeconductor/tasks/<task_id>.lock
```

From this point `specs/` and `tests/` are **read-only** for implementation
agents. The lock file is the only authority on what was frozen.

Stop gate: the lock file exists and a fresh recompute matches it.

## Stage 2 — Gated work under the freeze (`gate_runner`)

Run the gated work (TDD phases, review, merge checks) without touching the
frozen scope:

- Production code changes only within the Task Card `Scope / Files`.
- Any write attempt against `specs/` or `tests/` during gated work is a
  harness violation — stop execution and report, unless a HANDS_OFF handover
  is active (Stage 4).

## Stage 3 — Re-verify before the verdict (`freeze_judge` / reviewer)

Before the gate verdict, recompute the SHA-256 over the frozen scope and
compare it to `.codeconductor/tasks/<task_id>.lock`:

- **Match:** the gate result stands; record PASS with the recomputed hash.
- **Any single-byte difference:** abort the pipeline with scorecard 0
  (Specification Gaming). Do not pass, do not "re-freeze and continue" —
  escalate the tampered paths to a human operator.

## Stage 4 — HANDS_OFF exception (`mutation_testing`)

The ONLY authorized change to the frozen tests is the `mutation_testing`
hands-off protocol (same contract as `/cc-spec-mutation` Stage 5):

1. A mutant survives: the runner writes `specs/handover.md`, restores the
   original source unconditionally (`finally` rollback), and exits with code 2.
2. Route back to the craftsman with `specs/handover.md` as input: write the
   missing failing test that asserts the mutated branch — nothing else.
3. Re-run Stages 1–3 (re-freeze, then re-verify).

### Circuit breaker (max 3 loops)

If the freeze → gate → hands-off loop does not pass after **3 iterations**:
cancel active subagents, roll back to the last clean state, set scorecard
`STATUS = BLOCKED`, and escalate to a human operator.

## Guardrails (harness-enforced, not prompt-enforced)

- **Test Freezing:** SHA-256 of `specs/` + `tests/` stored in
  `.codeconductor/tasks/<task_id>.lock`; hash mismatch aborts the pipeline.
- **Read-only frozen scope:** `gateSpecTestDiffs` rejects any diff under
  `specs/` or `tests/` unless `handover: true` marks an active HANDS_OFF.
- **Runner rollback:** the mutation runner restores the original source
  unconditionally; a surviving mutant never ships as a source edit.
- **Worktree isolation:** run the whole flow in a dedicated `git worktree`;
  protected branches (`main`, `master`, `develop`) are never touched.

## Completion criteria

- [ ] `.codeconductor/tasks/<task_id>.lock` exists and matches a fresh recompute.
- [ ] Gate evidence was produced while the freeze held (no mid-run drift).
- [ ] Judge verdict PASS (recomputed hash matches, scope clean), or ABORT with
  tampered paths escalated.
- [ ] At most one HANDS_OFF test write per loop, within 3 loops total.
