# Bench Report

Generated: 2026-10-19T05:35:35.048Z (UTC)
Suite: `harness-v1` · N=3 · cheap=true
Claim: success-only
Verdict: **ACEPTA**
Hash: `691bdfdf8193e11d166b34a62cda5184426b7ef6258465e333ec2eb074dbcdd8`

## Reasons

- success criterion met

## Fingerprints

- harness: `n/a`
- prompt: `n/a`
- host: `n/a`
- model: `nvidia/nemotron-3-super-120b-a12b:free`
- pricing: `n/a`

Total cost (sum of cells): 6.1042879999999995

## Per-task tokens (median [IQR])

| Task | Baseline | Treatment | Δ median | IC 95% | Success B→T | NI |
| --- | --- | --- | ---: | --- | --- | --- |
| feature-multiply | 227899.0 [183541.5, 303848.0] | 141497.0 [130651.0, 183809.5] | -86402.0 | [-259992.0, 86938.0] | 0/3→0/3 | ok |
| fix-add-off-by-one | 248000.0 [186121.0, 268960.0] | 245212.0 [244041.5, 279299.5] | -2788.0 | [-47049.0, 189145.0] | 3/3→3/3 | ok |
| out-of-scope-guard | 118954.0 [109273.5, 129660.5] | 119134.0 [118847.5, 194734.5] | 180.0 | [-21806.0, 170742.0] | 3/3→3/3 | ok |
| refactor-greet | 228839.0 [226633.0, 296210.5] | 267015.0 [261034.0, 283106.0] | 38176.0 | [-108529.0, 74770.0] | 3/3→3/3 | ok |
| review-seeded-bug | 59418.0 [49265.0, 59483.5] | 59241.0 [59216.5, 59434.0] | -177.0 | [-357.0, 20515.0] | 0/3→0/3 | ok |
| TOTAL | 140367.0 | 226122.0 | 85755.0 | [-109034.0, 130811.0] | 9/15→9/15 | — |
