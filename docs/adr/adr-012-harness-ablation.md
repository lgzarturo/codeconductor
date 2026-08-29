# ADR-012: Deliberate harness ablation

**Status:** accepted
**Date:** 2026-08-28

## Context

Scorecards measure whether a Deliverable meets the Task Card contract
(acceptance, minimal diff, tests, cost). Outcomes aggregate by agent and
model. They do not record which harness pieces were active — CCEP phases,
confirmation gates, compile-fix loop, council, or product-graph knowledge —
so a quality change cannot be attributed to a component.

CodeConductor does not invoke LLMs ([ADR-011](adr-011-product-os-v1.md)).
An ablation runner cannot be a model orchestrator. It must be a reproducible
protocol: materialize a variant, isolate the run, let the host execute, then
compare tagged outcomes.

## Decision

1. **Catalog** — a small, toggleable set of harness components (leave-one-out,
   not 2^n). Default catalog lives in code; projects may override
   `.codeconductor/evaluation/harness-catalog.yml`.
2. **Fingerprint** — every tagged outcome stores `experimentId`, `variantId`
   (`baseline` or `minus:<id>`), `suiteTaskId`, `harnessFingerprint`, and
   `disabledComponents`. Fields are optional so existing `outcomes.jsonl`
   lines stay valid.
3. **Runner** — `scorecard experiment start|apply` writes CCEP/config overlays
   and Task Cards. It does not call a model. An optional later `executor`
   hook is out of scope.
4. **Report** — `scorecard ablation` pairs baseline vs minus-component on the
   same `suiteTaskId` and classifies `improves` / `degrades` / `no_change`
   with fixed thresholds (Δ score 0.10, Δ pass rate 5pp).

Persistence stays file-based under `.codeconductor/evaluation/`.

## Consequences

**Easier:**

- Maintainers can measure whether reviewer, wayfinding, council, or memory
  actually moves scorecard quality or cost.
- Prompt/contract bumps get a periodic ablation cadence without new infra.

**Harder:**

- Host agents must pass `--experiment` / `--variant` (or run inside an
  applied overlay) for outcomes to be comparable.
- Isolated experiment dirs still require a human or external agent to execute
  the golden suite.

**Constrains:**

- No combinatorial multi-component A/B in v1.
- No LLM invocation from the CLI.
- Scorecard criteria and weights stay unchanged.
