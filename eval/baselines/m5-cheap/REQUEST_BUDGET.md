# M5 cheap baseline — OpenRouter request budget (Phase 1→2)

Hard cap for **this repo**: **100** OpenRouter requests (fail-closed local proxy),
**accumulated across Actions runs**. Seed prior spend with
`BENCH_REQUESTS_ALREADY_USED`. Spent so far: **10 / 100** (runs 39777070216 +
39777659383 + 39778489974) → **90 left**. Combined with microsdd the org budget
is 200; do not cross-spend.

Additional proxy guard (Arturo 22 Oct): **20 requests / minute** sliding window,
fail-closed. Rate-limit rejects do **not** consume the durable 100 counter.

Claude Code is **pinned to 2.1.197** in `bench-baseline.yml` (fixture #18 /
run 39203481151). Do not use `latest` — 2.1.308 returned `unrecognized_model`.

### Root cause (proxy `/api` path) — fixed; smoke still fails after fix

Historical working config: `ANTHROPIC_BASE_URL=https://openrouter.ai/api`
(Claude SDK appends `/v1/messages` → `/api/v1/messages`).

The proxy set `ANTHROPIC_BASE_URL=http://127.0.0.1:PORT` (origin only), so Claude
POSTed `/v1/messages` and the proxy forwarded to `openrouter.ai/v1/messages`
(**missing `/api`**). Fix in `d8fae60`: `proxy.anthropicBaseUrl = origin + '/api'`
plus rewrite `/v1/…` → `/api/v1/…`; SSE piped; local token never forwarded;
offline smoke-replay test.

Relaunch [39778489974](https://github.com/lgzarturo/codeconductor/actions/runs/39778489974)
logged `anthropicBaseUrl=http://127.0.0.1:…/api` but smoke still
`is_error=true`. Confirmed elsewhere as **NVIDIA provider 404** on
`nvidia/nemotron-3-super-120b-a12b:free` (not a remaining proxy bug). Free-tier
exhaustion is also plausible (earlier builds &gt;1000 free requests).

**Model switch (Arturo 22 Oct):** probe `cohere/north-mini-code:free` first; on
failure use paid economic `openai/gpt-oss-20b` (**$0.018 / MTok prompt**,
**$0.09 / MTok completion**, tools). Max 3 probes total.

**Spend candado:** max **$5 usage Δ per repo** (key usage before/after). No
longer `:free`-only / key-limit ≤ $5 (account has ~$10 credit). Abort when Δ
approaches the cap.

Auth: Claude presents a one-shot `cc-proxy-local-*` token
(`ANTHROPIC_AUTH_TOKEN`). The proxy never forwards that token upstream; it
injects `OPENROUTER_API_KEY` only on the outbound hop. The Claude child env
must not contain `OPENROUTER_API_KEY`.

## Evidence from run [39203481151](https://github.com/lgzarturo/codeconductor/actions/runs/39203481151)

That run predates request metering and the treatment harness install. Aggregates
do **not** record per-cell HTTP request counts. What they do show:

| Signal | Value |
| --- | --- |
| Cells completed | 30 (5 tasks × 2 variants × N=3) |
| Wall clock (baseline step) | ~21 min |
| `tokensTotal` sum | ≈ 5.54M (mean ≈ 185k / cell) |
| `tokensInput` mean | ≈ 36k / cell |
| `tokensOutput` mean | ≈ 1.5k / cell |
| Request count in logs | **not present** |

Later hardening notes (commit `74db638`) reported **>1K requests / 21M tokens across
three push-triggered runs** of the uncapped agentic host — i.e. on the order of
**hundreds of requests per full 30-cell run**, not tens.

## Estimate (conservative)

Without stream/proxy counters in 39203481151, infer from tokens + agentic shape:

- Uncapped `claude -p` cell: **≈ 8–20 OpenRouter HTTP requests** (main turns +
  tool loops + `ANTHROPIC_SMALL_FAST_MODEL` / haiku-style side calls).
- With `--max-turns 3`–`5` and all aliases forced to one model: **≈ 5–12 requests / cell**.
- Smoke `di hola` (1 turn): **≈ 1–3 requests**.

Use **10 requests / cell** as the planning figure for a capped regen
(middle of the max-turns range, includes small-fast).

## Matrix that fits in 100 (N ≥ minN=3)

`minRepetitionsForMode(cheap) = 3`. Any matrix with **N&lt;3** yields
`NO CONCLUYENTE` by construction — do not use N=2.

Reserve **10** for smoke + lock/pricing admin + slack → **90** for cells.

| Matrix | Cells | Est. requests @10/cell | Fits in 100? | minN=3? |
| --- | ---: | ---: | --- | --- |
| **1 task × 2 var × N=3** | **6** | **60 + smoke** | **yes** | **yes** |
| 2 tasks × 2 × N=3 | 12 | 120 | **no** | yes |
| 3 tasks × 2 × N=3 | 18 | 180 | **no** | yes |
| 2 tasks × 2 × N=2 | 8 | 80 + smoke | yes (numeric) | **no** → NO CONCLUYENTE |
| 5 tasks × 2 × N=3 | 30 | 300 | **no** | yes |

Worst-case check @12/cell + smoke≈3: 6×12+3=**75** ≤ 100. Two tasks at N=3
would be 12×12+3=**147** — does not fit safely.

**Phase-2 matrix (approved):** `fix-add-off-by-one` only, both variants, **N=3**,
`--max-turns 3` → **6 cells** (~60–75 requests) + smoke ≤ 100.

Env for Actions:

```bash
BENCH_N=3
BENCH_TASK_IDS=fix-add-off-by-one
BENCH_MAX_TURNS=3
BENCH_MAX_REQUESTS=100
BENCH_MAX_REQUESTS_PER_MINUTE=20
BENCH_MAX_SPEND_USD=5
BENCH_MODEL_ID=cohere/north-mini-code:free
BENCH_FALLBACK_MODEL_ID=openai/gpt-oss-20b
```

The frozen aggregates under this directory remain **Invalid** until a proxied,
harness-loading regen with this matrix lands.
