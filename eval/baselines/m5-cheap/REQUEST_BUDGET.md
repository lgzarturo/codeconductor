# M5 cheap baseline — request budget (deepseek reset)

**Arturo 22 Oct 9:51 Cancún — NEW budget for this repo.**

| | |
| --- | --- |
| Model | `deepseek/deepseek-v4-flash` ($0.091 / $0.182 per MTok) |
| Request cap | **100** — counter **reset to 0** (documented; prior cohere spend archived) |
| Spend candado | **$0.49** usage Δ (key before/after); both-repos total **$0.99** |
| Rate limit | 20/min **wait/queue** (not 429) |
| Countable | POST messages only (`/v1/messages`, `/v1/chat/completions`) |
| Claude | 2.1.197; `CLAUDE_CODE_MAX_RETRIES=0` |
| maxTurns | **6** (not 3 — avoids `error_max_turns`) |

## Matrix

| Phase | Cells | Notes |
| --- | ---: | --- |
| Sonda | 1 | baseline only, maxTurns=6; stop if not success |
| Full | 6 | 1 task × 2 × N=3, maxTurns=6 |

Env:

```bash
BENCH_MODEL_ID=deepseek/deepseek-v4-flash
BENCH_MAX_REQUESTS=100
BENCH_REQUESTS_ALREADY_USED=9   # after first sonda; 0 at campaign start
BENCH_MAX_SPEND_USD=0.49
BENCH_MAX_REQUESTS_PER_MINUTE=20
BENCH_MAX_TURNS=6
BENCH_SONDA=1   # or 0 for matrix
BENCH_N=1       # sonda; matrix uses 3
```

## Accumulated spend log

| Run | maxTurns | Countable POSTs (proxy) | Usage Δ |
| --- | ---: | ---: | ---: |
| Sonda 39800247302 | 3 | 9 | $0 |
| Matrix 39800579851 (accidental, before turns=6) | 3 | 55 absolute | +$0.056 |
| **Seed for next** | | **55** | |
