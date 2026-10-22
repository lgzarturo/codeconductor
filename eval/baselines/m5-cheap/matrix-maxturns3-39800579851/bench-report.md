# Bench Report

Generated: 2026-10-22T15:06:12.638Z (UTC)
Suite: `harness-v1` · N=3 · cheap=true
Claim: success-only
Verdict: **RECHAZA**
Hash: `ac549c2666be995f372f4afcbfd8ff49648204f4b8effb754e8dcb1b41d3688d`

## Reasons

- success criterion failed (rate or per-task non-inferiority)

## Fingerprints

- harness: `n/a`
- prompt: `n/a`
- host: `n/a`
- model: `deepseek/deepseek-v4-flash`
- pricing: `n/a`

Total cost (sum of cells): 0.9374375

## Per-task tokens (median [IQR])

| Task | Baseline | Treatment | Δ median | IC 95% | Success B→T | NI |
| --- | --- | --- | ---: | --- | --- | --- |
| fix-add-off-by-one | 58465.0 [48506.5, 81291.0] | 85374.0 [84832.5, 97261.0] | 26909.0 | [-19826.0, 70600.0] | 3/3→0/3 | FAIL |
| TOTAL | 58465.0 | 85374.0 | 26909.0 | [-19826.0, 70600.0] | 3/3→0/3 | — |
