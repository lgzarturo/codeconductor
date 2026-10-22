# M5 cheap baseline (OpenRouter)

> Proxied regen under the **100-request repo-accumulated** cap + **20 req/min**
> fail-closed rate limit. Claude Code pinned to **2.1.197**. Matrix:
> **1×2×N=3** (`fix-add-off-by-one`, max-turns 3).

## Latest run — [39789258349](https://github.com/lgzarturo/codeconductor/actions/runs/39789258349)

| Field | Value |
| --- | --- |
| Model | `cohere/north-mini-code:free` (1 probe ok; paid fallback unused) |
| List price | **$0 / MTok** prompt + completion (`:free`) |
| Requests | **100 / 100** accumulated (seed 10 + 90 this run) |
| Usage Δ | **$0.00000298** (`0` → `0.00000298`; limit `$5`) |
| Cells | **4 completed / 2 pending** (budget exhausted mid-matrix) |
| Baseline | 2 cells, success **0/2** (reps 2,3; rep 1 pending) |
| Treatment | 2 cells, success **0/2** (reps 2,3; rep 1 pending) |
| Auto verdict | `ACEPTA` (success-only) but **`runValid=false`**, aborted |
| Abort | `request budget exhausted (proxy 429 request_budget_exhausted)` |
| Hops | 140 logged (83×200, 48×429 rate/budget, 9×HEAD 401) |

**No relaunch:** accumulated cap is exhausted. Incomplete N&lt;3 per arm → treat as
**NO CONCLUYENTE** for decision-making despite the auto `ACEPTA` label.

## Model (Arturo 22 Oct)

- **Primary probe:** `cohere/north-mini-code:free` (tools). Worked on this run.
- **Paid economic fallback:** `openai/gpt-oss-20b` — **$0.018 / MTok prompt**,
  **$0.09 / MTok completion**; tools. Not needed this run.
- Max **3 probes** total.

## Caps / hygiene

- OpenRouter requests: **accumulated 100** — now **exhausted** after 39789258349.
- Proxy rate limit: **20 requests / minute** (fail-closed).
- Spend candado: **max $5 usage Δ / repo**; this run Δ ≈ $0.000003.
- Key only on the proxy outbound hop.

See `REQUEST_BUDGET.md` and frozen aggregates in this directory.
