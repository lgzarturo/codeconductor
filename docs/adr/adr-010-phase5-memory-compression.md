# ADR-010: Phase 5 — Memory Compression & Token Savings

**Status:** accepted
**Date:** 2026-07-08

## Context

CodeConductor agents currently operate with unbounded context growth. The
orchestrator produces verbose self-summaries, inter-agent messages carry
redundant content, and there is no mechanism to clear history after completed
phases. Over long workflows (50+ iterations), context can exceed 100KB+,
degrading agent performance and increasing token costs. The `maxTokenBudget`
field exists in the LoopConfig and LoopState schemas but is not enforced.

Phase 5 addresses this with four mechanisms: micro-context injection from Task
Card Scope, compaction hooks after TDD cycles, concise inter-agent messaging, and
token budget enforcement in the compile-fix loop.

## Decision

Implement the four mechanisms as independent, composable modules:

1. **Micro-context injection** — `ContextInjector` reads Task Card Scope block
   and produces a filtered file list. The orchestrator passes only those files to
   agents during SDD/TDD phases.

2. **Compaction hook** — After TDD GREEN phase passes, the cc-tdd-cycle workflow
   clears detailed history (RED/GREEN phase transcripts) and passes only the
   summary report forward. This is a workflow-level behavior change, not a
   code-level hook.

3. **Concise inter-agent messages** — Agent contracts are updated so agents
   produce only their deliverables (no self-praise, no "I will now..."). The
   orchestrator's output format is simplified — it emits the routing decision and
   status only, not a full self-summary.

4. **Token budget enforcement** — Implement the existing `maxTokenBudget` and
   `tokenBudgetUsed` placeholders in `loop-state.ts` and `loop-controller.ts`.
   The `generateFn` signature is extended to return token usage, which is
   accumulated and checked against the budget.

These are independent — token budget enforcement can ship before context
injection. They share the same acceptance criteria (≤40KB budgets).

## Consequences

**Easier:**
- Agents operate with smaller, more focused context windows
- Token costs decrease linearly with context size
- TDD cycles leave no history residue after completing
- Token budget enforcement prevents runaway loops from consuming excessive tokens

**Harder:**
- Context injection requires Task Card Scope to be accurate — if Scope is
  incomplete, agents may miss relevant files. This is an existing requirement,
  not a new constraint.
- Compaction hooks are workflow-level (prompts), not enforceable by code. If a
  human runs the TDD workflow manually outside the cc-tdd-cycle skill, the
  compaction hook does not fire.

**Constrains:**
- Preset files must stay ≤40KB (existing constraint, reinforced here)
- `maxTokenBudget` defaults to 0 (unlimited) — no breaking change
- Backward compatible: all new behavior is opt-in via config or workflow
