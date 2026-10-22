# M5 cheap baseline — OpenRouter request budget (Phase 1, offline)

Hard cap for **this repo**: **100** OpenRouter requests (fail-closed local proxy).
Combined with microsdd the org budget is 200; do not cross-spend.

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
- With `--max-turns 5` and all aliases forced to `:free`: **≈ 5–12 requests / cell**.
- Smoke `di hola` (1 turn): **≈ 1–3 requests**.

Use **10 requests / cell** as the planning figure for a capped regen
(middle of the max-turns range, includes small-fast).

## Matrix that fits in 100

Reserve **10** for smoke + lock/pricing admin + slack → **90** for cells.

| Matrix | Cells | Est. requests @10/cell | Fits in 100? |
| --- | ---: | ---: | --- |
| 1 task × 2 var × N=3 | 6 | 60 + smoke | yes |
| 2 tasks × 2 × N=3 | 12 | 120 | **no** |
| 3 tasks × 2 × N=2 | 12 | 120 | **no** |
| 5 tasks × 2 × N=1 | 10 | 100 | borderline (no slack) |
| 2 tasks × 2 × N=2 | 8 | 80 + smoke | **yes (recommended)** |
| 1 task × 2 × N=5 | 10 | 100 | borderline |

**Proposed Phase-2 matrix:** `fix-add-off-by-one` + `review-seeded-bug`,
N=2, both variants → **8 cells** (~80 requests) + smoke ≤ 100, with headroom if
a cell spikes. Do **not** launch until Arturo approves.

The frozen aggregates under this directory remain **Invalid** until a proxied,
harness-loading regen lands.
