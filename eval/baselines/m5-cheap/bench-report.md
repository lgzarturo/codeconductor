# Bench report (M5 cheap — path fix relaunch aborted at smoke)

- **Actions run:** https://github.com/lgzarturo/codeconductor/actions/runs/39778489974
- **Code head:** `d8fae60` (Claude Code 2.1.197, `anthropicBaseUrl=…/api`, seed 8/100)
- **Matrix planned:** 1 × 2 × N=3
- **Completed cells:** 0
- **Proxy (accumulated):** **10 / 100** (prior 8 + this smoke ≈2)
- **Usage:** before=$0 → after=$0
- **Verdict:** NO CONCLUYENTE
- **Abort:** smoke `exit=1` `subtype=success` `is_error=true` despite correct `/api` base URL
- **Stop:** no further relaunch per instructions

## Root cause fixed (necessary, not yet sufficient)

Historical: `ANTHROPIC_BASE_URL=https://openrouter.ai/api` → `/api/v1/messages`.
Broken proxy: origin-only BASE_URL → Claude POST `/v1/messages` → forwarded to
`openrouter.ai/v1/messages` (missing `/api`). Fix shipped: `anthropicBaseUrl`
+ path rewrite + SSE pipe test. This relaunch confirmed BASE_URL=`…/api` in logs
but smoke still failed; remaining host/proxy issue unknown without hop statuses.
