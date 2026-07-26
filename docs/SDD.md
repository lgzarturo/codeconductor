# SDD — Spec-Driven Development pipeline

The SDD pipeline is CodeConductor's 8-phase workflow loop: it takes a raw
request through intake, design, test-first implementation, validation, and a
council verdict, enforcing STOP gates and operational guardrails along the way.

**Source of truth:** `src/core/pipeline/workflow-loop.ts`.

The pipeline is dependency-injected: `runWorkflowPipeline(rawRequest, config)`
receives a `PipelineConfig` whose `callbacks` implement each phase. The loop owns
sequencing, gates, and guardrails; the callbacks own the actual agent work. This
keeps the orchestration testable in isolation.

```ts
const result = await runWorkflowPipeline(request, {
  maxWallClockSeconds: 900,
  maxFilesModified: 25,
  maxLinesChanged: 800,
  cwd: projectRoot,
  callbacks: { runIntake, runStructure, runDesign, runTest,
               runImplement, runValidate, runCouncilReview, runCompact,
               onStopGate },
});
```

`PipelineResult` reports `{ success, phase, error?, taskCard?, technicalPlan?, verdict? }`.
`phase` is the last phase reached — on failure it points at where the loop
stopped; on success it is `DONE`.

---

## The eight phases

| # | Phase | Callback | Exit condition |
| --- | --- | --- | --- |
| 1 | `INTAKE` | `runIntake(rawRequest)` | Produces a `TaskCard` (DDD framing: type, risk, scope, acceptance criteria, constraints). |
| 2 | `STRUCTURE` | `runStructure(card)` | Returns a compacted `TaskCard`. |
| 3 | `DESIGN` | `runDesign(card)` | Produces a `TechnicalPlan`. **STOP Gate 1** follows. |
| 4 | `TEST` | `runTest(plan)` | TDD **Red**: the written suite *must* fail (`suiteFails === true`), else the phase errors. |
| 5 | `IMPLEMENT` | `runImplement(plan, feedback?)` | TDD **Green**: retried up to 3 iterations until `testsPass`; git guardrails checked each iteration. |
| 6 | `VALIDATE` | `runValidate(plan)` | Mutation score `>= 80%` **and** diff scope audit passed. |
| 7 | `COUNCIL` | `runCouncilReview(plan, validation)` | Individual verdicts → `councilConsensus`. Must be `APPROVED`; `REJECTED`/`ESCALATED` stop the loop. **STOP Gate 2** follows. |
| 8 | `COMPACT` | `runCompact(card, summary)` | Memory compaction. Success → `DONE`. |

---

## STOP gates

`onStopGate(phase, data)` is invoked after **Design (phase 3)** and after the
**Council verdict (phase 7)**. It must return `'APPROVE'`, `'REJECT'`, or
`'ESCALATE'`. Anything other than `'APPROVE'` halts the pipeline with the current
phase recorded. These are the human-in-the-loop checkpoints from the routing
policy: design review before code, and verdict review before landing.

---

## Operational guardrails

Configured via `PipelineConfig` (a value of `0` disables the check):

- **`maxWallClockSeconds`** — checked before every phase. Elapsed time over the
  limit fails the loop with a timeout error.
- **`maxFilesModified`** — checked during the implement loop via
  `git status --porcelain`.
- **`maxLinesChanged`** — checked during the implement loop via
  `git diff --numstat` (added + deleted).

Guardrails bound blast radius: a runaway implementation phase trips the file/line
limits before it can sprawl.

---

## TDD contract

The pipeline enforces test-first mechanically:

1. **Red** (phase 4): tests are written and the suite is expected to fail. A
   passing suite here means the tests do not actually exercise the new behavior —
   the loop rejects it.
2. **Green** (phase 5): implementation runs in a bounded loop (max 3 iterations),
   feeding failure feedback back into the next iteration until the suite passes.
3. **Validate** (phase 6): mutation testing (`>= 80%`) confirms the tests are
   meaningful, and the diff audit confirms changes stayed inside the plan's
   `filesAffected`.

---

## Relationship to CCEP and the council

- Each phase's agent prompt is compiled by **CCEP** (`docs/CCEP.md`); the phase's
  `role` and `outputSchema` come from the workflow profile.
- Phase 7 aggregates reviewer verdicts through the **council consensus engine**
  (`docs/council-steering.md`): security/compliance vetoes and confidence
  thresholds can turn an apparent majority into `REJECTED` or `ESCALATED`.
