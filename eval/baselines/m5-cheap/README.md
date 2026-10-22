# M5 cheap baseline (OpenRouter)

> New budget (Arturo **22 Oct 9:51 Cancún**). Claude Code **2.1.197**.

## Model

- **`deepseek/deepseek-v4-flash`**
  - List price: **$0.091 / MTok prompt**, **$0.182 / MTok completion**
  - Tools / `tool_choice` supported

## Caps (reset)

| Cap | Value |
| --- | --- |
| Requests | **100** accumulated — **counter RESET to 0** (new deepseek campaign; prior cohere 100/100 archived) |
| Rate limit | **20/min** — proxy **waits** (no 429); wait timeout 180s → 403 |
| Spend candado | **$0.49** usage Δ this repo (both-repos total $0.99); fail-closed; abort approaching |
| What counts | Only **POST** `/v1/messages` or `/v1/chat/completions` forwarded |
| Local free | **HEAD** + `/health` — no slot |
| Retries | `CLAUDE_CODE_MAX_RETRIES=0`, `ANTHROPIC_MAX_RETRIES=0` |

Proxy ported from microsdd `0755fde` / `3165a84`.

## Flow

1. **Sonda:** 1 cell (`fix-add-off-by-one`, **baseline** only). If `success≠true` → **STOP**, no matrix.
2. **Matrix** (only after sonda ok): 2 arms × N=3.

## Prior run (archived)

Cohere `:free` run [39789258349](https://github.com/lgzarturo/codeconductor/actions/runs/39789258349) exhausted the previous 100-cap mid-matrix. Not comparable to this reset.

See `REQUEST_BUDGET.md`.
