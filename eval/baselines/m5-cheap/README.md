# M5 cheap baseline (OpenRouter)

> New budget (Arturo **22 Oct 9:51 Cancún**). Claude Code **2.1.197**.

## Model

- **`deepseek/deepseek-v4-flash`**
  - List price: **$0.091 / MTok prompt**, **$0.182 / MTok completion**
  - Tools / `tool_choice` supported

## Caps (reset)

| Cap | Value |
| --- | --- |
| Requests | **100** accumulated — counter RESET; prior sonda(maxTurns=3) used **9** |
| Rate limit | **20/min** — proxy **waits** (no 429); wait timeout 180s → 403 |
| Spend candado | **$0.49** usage Δ this repo (both-repos total $0.99) |
| **maxTurns** | **6** (was 3 — microsdd: `error_max_turns` on almost all cells at 3; 6 → 15/16 nemotron) |
| What counts | Only **POST** messages forwarded |
| Retries | `CLAUDE_CODE_MAX_RETRIES=0` |

Proxy ported from microsdd `0755fde` / `3165a84`.

## Sonda (maxTurns=3, historical) — [39800247302](https://github.com/lgzarturo/codeconductor/actions/runs/39800247302)

Succeeded with maxTurns=3 but Arturo/microsdd require **6** before authorizing matrix.
Re-run sonda with maxTurns=6 (seed requests at 9).

See `REQUEST_BUDGET.md` and `sonda-39800247302/`.
