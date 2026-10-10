# BACKLOG Audit Since v1.6.1

Date: 2026-10-09. Base: tag `v1.6.1`. Reviewed candidate:
`29b0465df00f8088f4fb15ef0f2803baadf8799a`.

All 28 entries were cross-referenced against code, tests, commits, documents, and
OpenSpec state. The cleanup does not implement new features nor does it fabricate
retrospective evidence. A fulfilled functional criterion is not equivalent to a
formal closure when review or evidence required by the backlog itself is missing.

## Changes Post-1.6.1

| Commits | Verified Result |
| --- | --- |
| `7886225` | Node-compatible compile check; OpenSpec next switches to query mode without running a loop. |
| `fee1c40`, `147fa3c` | done preserves tasks.md and marks cards; archive requires checked boxes and only marks acceptance upon closing. |
| `d04fa2b`, `92f9ef7` | TDD capture via CLI and consumer invocation documentation. |
| `56d9407`, `a8ae760`, `926741f` | BC-026 migrates 14 skills to shared sources; closure with scorecard and approved cc_gain override. |
| `104aa8c` | The five research 1.7 foundations: Claude permissions, hook resolution, locks/persistence, DAG, and delta specs. |
| `29b0465` | BC-027 persists RED validation and preserves GREEN freshness; formal review is still marked as pending. |

The title of the last commit says complete BC-027, but it does not close its review
card nor provide a PASS scorecard. The source of truth for status remains the backlog and
cards, cross-referenced with evidence, not the commit title.

## Disposition of Entries

| Entries | Validation | Disposition |
| --- | --- | --- |
| BC-013 | start/done/block/archive and transitions in openspec.command.ts; completion-marking tests. | Move from Items to Archive, preserving DONE content. |
| BC-014 | Quorum, roster, confidence, and criticals in council-consensus; domain tests. | Move to Archive. |
| BC-015 | requiredFields, schema, adapters, risk, and TaskCard parity; CCEP tests. | Move to Archive. |
| BC-016 | Registry council-verdict and rejection of unknown schema; output-validator tests. | Move to Archive. |
| BC-017 | itemHash and drift reset in backlog-planner; planner tests. | Move to Archive. |
| BC-018 | Version 1.6.1, 70% coverage, lint and compile skipped; scripts, CI, and tests. | Move to Archive. |
| BC-019 | Eight criteria implemented; history reconciled and closure accepted by the user. | DONE/100%, archived via CLI. |
| BC-027 | Five criteria implemented and tested; review completed and closure accepted by the user. | DONE/100%, archived via CLI. |
| BC-028 | git diff HEAD and default values of 2 remain active. | Retain PLANNED/0%, five pending criteria. |
| BC-001 | Promised rubric was not located in docs; item does not identify a specific file. | Retain as historical per user decision, with documentation warning. |
| BC-002 | CONTEXT.md, docs/adr/template.md, and test/context-glossary.test.ts have 0 bytes in tag and HEAD. | Retain as historical per user decision, with documentation warning. |
| BC-003–012 | Review mechanics, RED, seams, dependencies, grilling, refactor, guardrail, precommit, handoff, and ask present. | Preserve archived history. |
| BC-020–025 | ODD, ledger, context, council, and adoption evaluation present in code and tests. | Preserve archived history. |
| BC-026 | Delivered post-tag; shared source and archived change. | Preserve Archive. |

The absence of a located document for BC-001 is insufficient evidence,
not proof that it was never delivered. BC-002 does exhibit a direct
contradiction between checked boxes and empty files. Their historical
closures are not silently rewritten.

## Initial Closure Diagnosis and Resolution

BC-019 was already implemented in 1.6.1. Per-file hashes are in
`src/core/install/installation-state.ts`; customization protection and
rollback are in `src/commands/update.command.ts` and
`src/core/install/update-transaction.ts`. version, status, setup, help, and
completion have maintenance implementations and tests.

Its historical PASS outcome contradicts two REJECT scorecards:
`sc-mu3hwq1q-8njp` (1.95) and `sc-mu3hyz8f-kl23` (1.8). Furthermore, verify reported
0 cards and 27 pending checkboxes prior to this cleanup. The five cards were
recovered exactly from commit `84b4fc5`, where they were already done, via
the validated status API; the current cards of BC-027 were preserved. The
checklist now accredits current coverage. The legacy evidence of the test
card records GREEN, not RED: a retrospective red is neither reconstructed nor asserted.

BC-027 validates and records red upon closing test, links task/evidence/nonce/hash,
and accepts that historical red without skipping GREEN verification. Tests
cover altered receipts, failed writes, incomplete evidence, and the case of
modifying an external file after closing test. The functional review of
this audit found no blocking defects within that scope.

Prior to closure, verify reported a pending review card, six checkboxes, and
a missing PASS scorecard. The functional audit and tests justify completing
the review; start/done were used for that card. GREEN is repeated against the
final document without inventing a new RED or a historical validation record.

The user explicitly decided to retain BC-001/002 as history and close
BC-019/027. Review PASS outcomes of human acceptance without numerical
scores were recorded, backed by the thirteen verified acceptances and 244
tests. The automated REJECT scorecards are preserved: they compare the diff of
this cleanup against the scope of already-committed implementations and detect the
lack of valid historical TDD evidence in the current format. This decision does not
declare BC-028 resolved nor transform those measurements into numerical PASS.

After reconciling cards and checklists, verify reported archiveReady true for both
items, with a TDD_EVIDENCE_MISSING warning preserved in this audit.
archive passed without --allow-unchecked: both became DONE/100% and their folders
were moved to `openspec/changes/archive/`. Their durable specs were also synchronized.
Human acceptance authorized this retrospective closure; it does not constitute
proof of a RED run recorded under the current contract.

BC-028 remains code work. `scorecard-signals.ts` compares against
HEAD and returns early with an empty diff; `scorecard-calculator.ts` still defaults
to 2. No per-item persisted base or pre/post-commit equality test was found.
Retaining the item prevents masking this defect through an unmeasured automated
scorecard during the cleanup itself.

## Current Scope and Future Work

The five blocks of the research plan are implemented and reviewed in
`docs/research-implementation-plan.md` and `docs/research-implementation-review.md`.
Do not create pending duplicates for them.

Detector, init with plan, uninstall, skill permissions, versioned invocations,
and verifiable CI/publishing are future work from the 1.7 diagnosis. Reducer,
transactional queue, drivers, and migration belong to 1.8; orchestrate retirement,
BACKLOG as a view, and Beads/parallelism to 2.0. Kotlin was superseded by the
TS/Bun design. These proposals remain out of scope for this cleanup unless
explicitly expanded by the user; they are not considered rejected because of this.

The report `2026-10-openspec-flujo-inconsistente.md` is a historical diagnosis.
Its Node, next, tasks.md, and TDD capture defects had subsequent fixes;
do not convert all its findings into pending items without revalidating them. H10/H11
are outside BC-027 and were not resolved by that delivery.

The historical Out of scope of BC-011 stated that context-injector did not exist;
`src/core/context/context-injector.ts` currently exists. That describes the
context of the original delivery and does not require reopening its functionality.
Active legacy change folders are not moved pretending to be a new delivery.

## Verification

- 191 focused tests of council, TaskCards, registry, planner, compile skip,
  documented workflows, ODD, coverage/lint, completion, and ask pass. The empty
  glossary test file executes no tests and does not back BC-002.
- 53 tests of installation-state, update, maintenance, TDD/RDD evidence, and
  analyze/scorecard pass. JUnit report: `/tmp/cc-backlog-audit-tests.xml`.
- Total observed: 244 tests, 0 failures. The complete suite was not rerun for
  this documentation edit; the foundations run completed with 3760/0.
- Before editing, openspec validate passed with 9 Items and 19 Archive; the first
  cleanup left 3 Items/25 Archive. Closure leaves 1 Item/27 Archive: only BC-028
  remains active, with its five criteria open.
- git diff --check passes. The RDD receipt is captured and verified after editing
  these documents; its freshness does not replace tests or pending review.
