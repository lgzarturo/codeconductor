# M5 cheap baseline (OpenRouter :free)

> **Invalid — do not use as a reference.** This run executed the same prompt on
> a bare fixture for both variants (treatment did not load the harness), with
> no request/token cap. Treatment now installs the Claude preset and runs are
> capped at 2M tokens / 150 requests. Regenerate via `workflow_dispatch`.

- **Mode:** `cheap: true`, N=3, seed=42
- **Model:** `nvidia/nemotron-3-super-120b-a12b:free` (list price 0 verified)
- **Date:** 2026-10-19T05:35:35.055Z (UTC)
- **Actions run:** https://github.com/lgzarturo/codeconductor/actions/runs/39203481151
- **Key usage:** before=$0 → after=$0 (Δ=$0); limit=$5
- **Verdict (success-only):** ACEPTA (9/15 → 9/15)
- **contentHash:** `691bdfdf8193e11d166b34a62cda5184426b7ef6258465e333ec2eb074dbcdd8`
- **Pending cells:** none (30/30 completed)

`costUsd` in cells is Claude Code Anthropic-table estimate (`unknown` basis) — **not** OpenRouter billed spend.

## Per-task success

| Task | Baseline | Treatment |
| --- | --- | --- |
| fix-add-off-by-one | 3/3 | 3/3 |
| feature-multiply | 0/3 | 0/3 |
| refactor-greet | 3/3 | 3/3 |
| review-seeded-bug | 0/3 | 0/3 |
| out-of-scope-guard | 3/3 | 3/3 |
| **Overall** | **9/15** | **9/15** |
