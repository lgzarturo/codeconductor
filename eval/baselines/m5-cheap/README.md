# M5 cheap baseline (OpenRouter :free)

> **Invalid — do not use as a reference.** Proxied regen attempts under the
> **100-request repo-accumulated** cap keep aborting at smoke. Claude Code
> pinned to **2.1.197**. Matrix remains **1×2×N=3**. See `REQUEST_BUDGET.md`.

## Root cause (proxy path) — fixed in `d8fae60`

Working historical config used `ANTHROPIC_BASE_URL=https://openrouter.ai/api`
so Claude’s `/v1/messages` hit OpenRouter `/api/v1/messages`. The proxy set
BASE_URL to the bare origin (`http://host:port`), forwarding to
`openrouter.ai/v1/messages` (**missing `/api`**). Fix: `proxy.anthropicBaseUrl`
(`…/api`), rewrite bare `/v1`→`/api/v1`, SSE pipe, offline smoke-replay test.

## Latest attempt — [39778489974](https://github.com/lgzarturo/codeconductor/actions/runs/39778489974)

- **Head:** `d8fae60` · Claude **2.1.197** · `anthropicBaseUrl=http://127.0.0.1:…/api` (confirmed in log)
- **Proxy:** **10 / 100** (seed 8 + ≈2 smoke hops)
- **Abort:** smoke still `is_error=true` — **no further relaunch**
- **Usage:** $0 → $0 · cells 0/6 · **NO CONCLUYENTE**

## Prior attempts

| Run | Claude | Proxy | Notes |
|---|---|---:|---|
| [39777070216](https://github.com/lgzarturo/codeconductor/actions/runs/39777070216) | 2.1.308 | 4 | `unrecognized_model` |
| [39777659383](https://github.com/lgzarturo/codeconductor/actions/runs/39777659383) | 2.1.197 | 8 | `is_error` (path bug still present) |
| [39778489974](https://github.com/lgzarturo/codeconductor/actions/runs/39778489974) | 2.1.197 | **10** | `/api` fixed; smoke still `is_error` |
