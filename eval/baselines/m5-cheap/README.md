# M5 cheap baseline (OpenRouter)

> Proxied regen under the **100-request repo-accumulated** cap + **20 req/min**
> fail-closed rate limit. Claude Code pinned to **2.1.197**. Matrix:
> **1×2×N=3** (`fix-add-off-by-one`, max-turns 3).

## Model (Arturo 22 Oct)

- **Primary probe:** `cohere/north-mini-code:free` (tools). May 404 if the
  OpenRouter free tier is exhausted (earlier CodeConductor builds burned
  &gt;1000 free requests).
- **Paid economic fallback (pinned when free fails):** `openai/gpt-oss-20b`
  - List price (OpenRouter `/api/v1/models`): **$0.018 / MTok prompt**,
    **$0.09 / MTok completion**; supports `tools` / `tool_choice`.
  - Chosen as a cheap paid + tools route after free-tier exhaustion / NVIDIA
    `:free` provider 404 on `nvidia/nemotron-3-super-120b-a12b:free`.
- Probe: ≤1 hop per candidate through the fail-closed proxy (counts toward the
  cap). Max **3 probes** total; no substitute loop beyond that.

## Caps / hygiene

- OpenRouter requests: **accumulated 100** (`BENCH_REQUESTS_ALREADY_USED` seeds
  prior spend; currently **10** before this regen → **90** left).
- Proxy rate limit: **20 requests / minute** (fail-closed; rejects do not
  consume the durable counter).
- Spend candado: **max $5 usage Δ per repo** (not `:free`-only). Verified with
  `/api/v1/key` usage before and after; abort when Δ approaches the cap (90%).
  Account has ~$10 credit; key stays on the proxy outbound hop only.
- Diagnostics: sanitized `resultTruncated` on `is_error`; hop log =
  `{method, upstreamStatus}` only.

See `REQUEST_BUDGET.md` for matrix math and path-fix history.
