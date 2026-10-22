# M5 cheap baseline (OpenRouter :free)

> **Invalid — do not use as a reference.** Prior run (39203481151) lacked harness
> on treatment and had no request cap. Proxied regen attempts under the
> **100-request repo-accumulated** cap aborted at smoke (see below). Matrix for
> Phase-2 remains **1×2×N=3** (`fix-add-off-by-one`, max-turns 3) — see
> `REQUEST_BUDGET.md`. Claude Code is pinned to **2.1.197**.

## Latest attempt — [39777659383](https://github.com/lgzarturo/codeconductor/actions/runs/39777659383)

- **Head:** `44d5a30` · Claude Code **2.1.197** · seed `BENCH_REQUESTS_ALREADY_USED=4`
- **Model:** `nvidia/nemotron-3-super-120b-a12b:free` — still on public OpenRouter
  `:free` catalog (price 0); **no substitute chosen**
- **Abort:** smoke `exit=1` `subtype=success` `is_error=true` (not `unrecognized_model`)
- **Proxy:** **8 / 100** accumulated (4 prior + 4 this smoke)
- **Usage:** before=$0 → after=$0 · **Verdict:** NO CONCLUYENTE · cells 0/6

## Prior attempt — [39777070216](https://github.com/lgzarturo/codeconductor/actions/runs/39777070216)

- Claude Code **2.1.308** (unpinned `latest`) → `[claude-code:unrecognized_model]`
- Proxy: 4 / 100 · usage Δ=$0

## Historical Invalid — [39203481151](https://github.com/lgzarturo/codeconductor/actions/runs/39203481151)

- N=3 full suite, no harness on treatment, no request cap
- Verdict ACEPTA 9/15→9/15 — **Invalid**

| Task | Baseline | Treatment |
| --- | --- | --- |
| fix-add-off-by-one | 3/3 | 3/3 |
| feature-multiply | 0/3 | 0/3 |
| refactor-greet | 3/3 | 3/3 |
| review-seeded-bug | 0/3 | 0/3 |
| out-of-scope-guard | 3/3 | 3/3 |
| **Overall** | **9/15** | **9/15** |
