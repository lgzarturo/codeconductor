# M5 cheap baseline (OpenRouter :free)

> **Invalid — do not use as a reference.** Prior run (39203481151) executed the
> same prompt on a bare fixture for both variants (treatment did not load the
> harness), with no request/token cap. Regen attempt
> [39777070216](https://github.com/lgzarturo/codeconductor/actions/runs/39777070216)
> (@ `53bf53d`, proxied, cap 100, matrix 1×2×N=3) **aborted at smoke**: Claude
> Code 2.1.308 returned `[claude-code:unrecognized_model]` for
> `nvidia/nemotron-3-super-120b-a12b:free`. Proxy counted **4** requests;
> usage Δ=$0. See `REQUEST_BUDGET.md` for the Phase-2 matrix.

## Regen attempt 39777070216 (aborted)

- **Mode:** `cheap: true`, N=3, seed=42, task=`fix-add-off-by-one`, max-turns=3
- **Model:** `nvidia/nemotron-3-super-120b-a12b:free` (pricing gate OK; Claude Code rejected id)
- **Date:** 2026-10-22T12:17:19Z (UTC)
- **Actions run:** https://github.com/lgzarturo/codeconductor/actions/runs/39777070216
- **Key usage:** before=$0 → after=$0 (Δ=$0); limit=$5
- **Proxy requests:** 4 / 100
- **Verdict:** NO CONCLUYENTE (smoke failed)
- **Completed cells:** 0 / 6 planned
- **Pending cells:** none (aborted before schedule)

## Prior Invalid aggregates (39203481151) — historical only

- **Mode:** `cheap: true`, N=3, seed=42 (full 5-task suite)
- **Date:** 2026-10-19T05:35:35.055Z (UTC)
- **Actions run:** https://github.com/lgzarturo/codeconductor/actions/runs/39203481151
- **Key usage:** before=$0 → after=$0 (Δ=$0); limit=$5
- **Verdict (success-only):** ACEPTA (9/15 → 9/15) — **Invalid** (no harness on treatment)
- **contentHash:** `691bdfdf8193e11d166b34a62cda5184426b7ef6258465e333ec2eb074dbcdd8`

`costUsd` in cells is Claude Code Anthropic-table estimate (`unknown` basis) — **not** OpenRouter billed spend.

## Per-task success (39203481151 — Invalid)

| Task | Baseline | Treatment |
| --- | --- | --- |
| fix-add-off-by-one | 3/3 | 3/3 |
| feature-multiply | 0/3 | 0/3 |
| refactor-greet | 3/3 | 3/3 |
| review-seeded-bug | 0/3 | 0/3 |
| out-of-scope-guard | 3/3 | 3/3 |
| **Overall** | **9/15** | **9/15** |
