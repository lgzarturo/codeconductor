# M5 cheap baseline (OpenRouter)

> New budget (Arturo **22 Oct 9:51 Cancún**). Claude Code **2.1.197**.

## Model

- **`deepseek/deepseek-v4-flash`**
  - List price: **$0.091 / MTok prompt**, **$0.182 / MTok completion**
  - Tools / `tool_choice` supported

## Caps (reset)

| Cap | Value |
| --- | --- |
| Requests | **100** accumulated — **counter RESET** then sonda used **9** → seed matrix at 9 |
| Rate limit | **20/min** — proxy **waits** (no 429); wait timeout 180s → 403 |
| Spend candado | **$0.49** usage Δ this repo (both-repos total $0.99) |
| What counts | Only **POST** messages forwarded |
| Retries | `CLAUDE_CODE_MAX_RETRIES=0` |

Proxy ported from microsdd `0755fde` / `3165a84`.

## Sonda — [39800247302](https://github.com/lgzarturo/codeconductor/actions/runs/39800247302)

| | |
| --- | --- |
| Cell | baseline `fix-add-off-by-one` rep 1 — **success=true** |
| Requests | **9 / 100** |
| Usage Δ | **$0** (`0.037115136` → `0.037115136`) |
| Gate | **PASS** → matrix authorized |

## Matrix

2 arms × N=3 (in progress / see latest Actions).

See `REQUEST_BUDGET.md` and `sonda-39800247302/`.
