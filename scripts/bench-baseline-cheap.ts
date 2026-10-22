/**
 * Cheap M5 baseline entrypoint for GitHub Actions.
 *
 * - Requires OPENROUTER_API_KEY in env (parent/proxy only — never printed,
 *   never passed to the Claude child).
 * - Starts a fail-closed local request proxy; Claude gets a one-shot
 *   `cc-proxy-local-*` token in ANTHROPIC_AUTH_TOKEN (never forwarded upstream).
 * - Smoke: `claude -p "di hola"` (2 attempts).
 * - Verifies model is :free with list price 0 via /api/v1/models.
 * - Enforces M3 spend lock before run + between tasks; post-lock always.
 * - Writes sanitized aggregates even on failure (§7).
 *
 * Usage:
 *   bun run scripts/bench-baseline-cheap.ts
 *   BENCH_SMOKE_ONLY=1 bun run scripts/bench-baseline-cheap.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBench } from '../src/core/evaluation/bench/runner';
import {
  assertOpenRouterModelFreeZeroPrice,
  openRouterFreeModelStillListed,
} from '../src/core/evaluation/bench/openrouter-free-model';
import {
  createBenchBudget,
  ensureClaudeCiConfig,
  runClaudeSmoke,
} from '../src/core/evaluation/bench/host-claude';
import {
  DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN,
  DEFAULT_OPENROUTER_REQUEST_CAP,
  defaultRequestCounterPath,
  mintProxyLocalToken,
  publicProxyHops,
  startOpenRouterRequestProxy,
  type OpenRouterRequestProxy,
} from '../src/core/evaluation/bench/openrouter-request-proxy';
import {
  DEFAULT_OPENROUTER_SPEND_CAP_USD,
  fetchOpenRouterKeySnapshot,
} from '../src/core/telemetry/openrouter-spend-lock';
import { probeModelViaProxy } from '../src/core/evaluation/bench/model-probe';

/** Primary: try `:free` first; paid economic fallback if free fails (Arturo 22 Oct). */
const PRIMARY_MODEL_ID =
  process.env.BENCH_MODEL_ID?.trim() ||
  'cohere/north-mini-code:free';
/** Cheap paid + tools: $0.018/MTok prompt, $0.09/MTok completion (OpenRouter list). */
const FALLBACK_MODEL_ID =
  process.env.BENCH_FALLBACK_MODEL_ID?.trim() ||
  'openai/gpt-oss-20b';
const FALLBACK_LIST_PRICE = {
  promptPerMTokUsd: 0.018,
  completionPerMTokUsd: 0.09,
  source: 'openrouter.ai/api/v1/models',
} as const;
const OUT_DIR = resolve(process.env.BENCH_OUT_DIR?.trim() || 'bench-out');
const PROJECT_ROOT = resolve(process.env.BENCH_PROJECT_ROOT?.trim() || '.');
const N = Number(process.env.BENCH_N ?? '3');
const SEED = Number(process.env.BENCH_SEED ?? '42');
const SMOKE_ONLY = process.env.BENCH_SMOKE_ONLY === '1';
const MAX_TURNS = Number(process.env.BENCH_MAX_TURNS ?? '3');
const TASK_IDS = (process.env.BENCH_TASK_IDS ?? 'fix-add-off-by-one')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Repo-accumulated OpenRouter request cap (default 100). Prior Actions spend
// seeds the durable counter so this run only consumes the remainder.
const MAX_TOKENS = Number(process.env.BENCH_MAX_TOKENS ?? '2000000');
const MAX_REQUESTS = Number(
  process.env.BENCH_MAX_REQUESTS ?? String(DEFAULT_OPENROUTER_REQUEST_CAP),
);
const MAX_REQUESTS_PER_MINUTE = Number(
  process.env.BENCH_MAX_REQUESTS_PER_MINUTE ??
    String(DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN),
);
const MAX_SPEND_USD = Number(
  process.env.BENCH_MAX_SPEND_USD ?? String(DEFAULT_OPENROUTER_SPEND_CAP_USD),
);
const REQUESTS_ALREADY_USED = Number(process.env.BENCH_REQUESTS_ALREADY_USED ?? '0');
const STREAM_MAX_REQUESTS = Math.max(0, MAX_REQUESTS - REQUESTS_ALREADY_USED);
/** Max model probes this process (Arturo: ≤3 total across attempts). */
const MAX_PROBES = Number(process.env.BENCH_MAX_PROBES ?? '3');

function logEvent(payload: Record<string, unknown>): void {
  // Never include env values / secrets.
  console.log(JSON.stringify(payload));
}

async function writeAggregate(payload: unknown): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    resolve(OUT_DIR, 'bench-baseline-cheap.json'),
    JSON.stringify(payload, null, 2),
    'utf-8',
  );
}

async function main(): Promise<void> {
  let usageBefore: number | null = null;
  let usageAfter: number | null = null;
  let exitCode = 0;
  let abortReason: string | null = null;
  let proxyCount: number | null = null;
  let MODEL_ID = PRIMARY_MODEL_ID;
  let probesUsed = 0;
  let listPrice: {
    promptPerMTokUsd: number | null;
    completionPerMTokUsd: number | null;
    source: string;
  } | null = null;

  const upstreamApiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!upstreamApiKey) {
    const payload = {
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      aborted: true,
      abortReason:
        'OPENROUTER_API_KEY secret is not available — aborting (no alternate key source)',
      usageBefore: null,
      usageAfter: null,
      completedCells: [],
      pendingCells: [],
      smoke: null,
      verdict: 'NO CONCLUYENTE',
    };
    await writeAggregate(payload);
    logEvent({ event: 'bench-baseline-abort', reason: payload.abortReason });
    process.exit(1);
  }

  // Parent keeps OPENROUTER_API_KEY for /api/v1/key + pricing only.
  // Claude child must never see it — mint a one-shot local proxy token.
  const localAuthToken = mintProxyLocalToken();
  process.env.ANTHROPIC_API_KEY = '';
  process.env.ANTHROPIC_AUTH_TOKEN = localAuthToken;

  if (
    !Number.isFinite(REQUESTS_ALREADY_USED) ||
    REQUESTS_ALREADY_USED < 0 ||
    Math.floor(REQUESTS_ALREADY_USED) !== REQUESTS_ALREADY_USED ||
    REQUESTS_ALREADY_USED > MAX_REQUESTS
  ) {
    await writeAggregate({
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      aborted: true,
      abortReason: `BENCH_REQUESTS_ALREADY_USED must be an integer in [0, ${MAX_REQUESTS}]`,
      usageBefore: null,
      usageAfter: null,
      completedCells: [],
      pendingCells: [],
      verdict: 'NO CONCLUYENTE',
    });
    process.exit(1);
  }

  await ensureClaudeCiConfig();
  // Stream meter only counts this run's hops; proxy enforces the absolute cap.
  const budget = createBenchBudget(MAX_TOKENS, STREAM_MAX_REQUESTS);

  let proxy: OpenRouterRequestProxy | null = null;
  try {
    const counterPath =
      process.env.BENCH_REQUEST_COUNTER_PATH?.trim() ||
      defaultRequestCounterPath(`m5-${Date.now()}`);
    try {
      proxy = await startOpenRouterRequestProxy({
        counterPath,
        maxRequests: MAX_REQUESTS,
        maxRequestsPerMinute: MAX_REQUESTS_PER_MINUTE,
        initialCount: REQUESTS_ALREADY_USED,
        upstreamApiKey,
        localAuthToken,
      });
    } catch (err) {
      abortReason =
        err instanceof Error
          ? `request proxy failed to start (fail-closed): ${err.message}`
          : 'request proxy failed to start (fail-closed)';
      await writeAggregate({
        schema: 'bench-baseline-cheap/v1',
        cheap: true,
        aborted: true,
        abortReason,
        usageBefore: null,
        usageAfter: null,
        completedCells: [],
        pendingCells: [],
        verdict: 'NO CONCLUYENTE',
      });
      process.exit(1);
    }
    // Mirror historical `https://openrouter.ai/api` so Claude's `/v1/messages`
    // lands on OpenRouter `/api/v1/messages` (bare proxy.origin would miss `/api`).
    process.env.ANTHROPIC_BASE_URL = proxy.anthropicBaseUrl;
    logEvent({
      event: 'request-proxy-started',
      maxRequests: MAX_REQUESTS,
      maxRequestsPerMinute: MAX_REQUESTS_PER_MINUTE,
      maxSpendUsd: MAX_SPEND_USD,
      requestsAlreadyUsed: REQUESTS_ALREADY_USED,
      streamMaxRequests: STREAM_MAX_REQUESTS,
      counterPath,
      proxyHost: proxy.host,
      proxyPort: proxy.port,
      anthropicBaseUrl: proxy.anthropicBaseUrl,
      taskIds: TASK_IDS,
      n: N,
      maxTurns: MAX_TURNS,
      primaryModelId: PRIMARY_MODEL_ID,
      fallbackModelId: FALLBACK_MODEL_ID,
    });

    const keyBefore = await fetchOpenRouterKeySnapshot();
    usageBefore = keyBefore?.usage ?? null;

    const candidates = [PRIMARY_MODEL_ID];
    if (
      FALLBACK_MODEL_ID &&
      FALLBACK_MODEL_ID !== PRIMARY_MODEL_ID &&
      candidates.length < MAX_PROBES
    ) {
      candidates.push(FALLBACK_MODEL_ID);
    }

    let probeOk = false;
    let lastProbe: Awaited<ReturnType<typeof probeModelViaProxy>> | null = null;
    let pricing: Awaited<ReturnType<typeof assertOpenRouterModelFreeZeroPrice>> | null =
      null;
    let probeCount: number | null = null;

    for (const candidate of candidates) {
      if (probesUsed >= MAX_PROBES) break;
      MODEL_ID = candidate;
      pricing = await assertOpenRouterModelFreeZeroPrice(MODEL_ID);
      if (!pricing.ok) {
        logEvent({
          event: 'bench-model-pricing-reject',
          modelId: MODEL_ID,
          reason: pricing.reason,
        });
        lastProbe = {
          ok: false,
          httpStatus: null,
          errorTruncated: null,
          reason: pricing.reason ?? 'pricing check failed',
        };
        continue;
      }
      if (pricing.isFree) {
        listPrice = {
          promptPerMTokUsd: 0,
          completionPerMTokUsd: 0,
          source: 'openrouter.ai/api/v1/models (:free)',
        };
      } else if (MODEL_ID === FALLBACK_MODEL_ID) {
        listPrice = { ...FALLBACK_LIST_PRICE };
      } else {
        listPrice = {
          promptPerMTokUsd:
            pricing.pricing?.prompt != null
              ? pricing.pricing.prompt * 1e6
              : null,
          completionPerMTokUsd:
            pricing.pricing?.completion != null
              ? pricing.pricing.completion * 1e6
              : null,
          source: 'openrouter.ai/api/v1/models',
        };
      }

      probesUsed += 1;
      logEvent({
        event: 'bench-model-probe-start',
        modelId: MODEL_ID,
        probeIndex: probesUsed,
        maxProbes: MAX_PROBES,
        listPrice,
      });
      lastProbe = await probeModelViaProxy({
        modelId: MODEL_ID,
        anthropicBaseUrl: proxy.anthropicBaseUrl,
        localAuthToken,
      });
      try {
        probeCount = await proxy.readCount();
      } catch {
        probeCount = null;
      }
      logEvent({
        event: 'bench-model-probe-done',
        modelId: MODEL_ID,
        probeIndex: probesUsed,
        ok: lastProbe.ok,
        httpStatus: lastProbe.httpStatus,
        reason: lastProbe.reason,
        errorTruncated: lastProbe.errorTruncated,
        proxyRequestCount: probeCount,
        hops: publicProxyHops(proxy.hops()),
      });
      if (lastProbe.ok) {
        probeOk = true;
        break;
      }
      // Free failed → try next candidate (paid). Do not loop beyond MAX_PROBES.
      logEvent({
        event: 'bench-model-probe-fallback',
        failedModelId: MODEL_ID,
        next:
          candidates[candidates.indexOf(candidate) + 1] ?? null,
        probesUsed,
      });
    }

    if (!probeOk || !lastProbe) {
      abortReason = `model probe failed after ${probesUsed} attempt(s): ${lastProbe?.reason ?? 'no candidate'}${lastProbe?.errorTruncated ? ` — ${lastProbe.errorTruncated}` : ''}`;
      exitCode = 1;
      try {
        const keyAfter = await fetchOpenRouterKeySnapshot();
        usageAfter = keyAfter?.usage ?? null;
      } catch {
        usageAfter = null;
      }
      await writeAggregate({
        schema: 'bench-baseline-cheap/v1',
        cheap: true,
        modelId: MODEL_ID,
        listPrice,
        probesUsed,
        maxSpendUsd: MAX_SPEND_USD,
        aborted: true,
        abortReason,
        usageBefore,
        usageAfter,
        usageDeltaUsd:
          usageBefore != null && usageAfter != null
            ? usageAfter - usageBefore
            : null,
        proxyRequestCount: probeCount,
        requestsAlreadyUsed: REQUESTS_ALREADY_USED,
        requestCap: MAX_REQUESTS,
        maxRequestsPerMinute: MAX_REQUESTS_PER_MINUTE,
        hops: publicProxyHops(proxy.hops()),
        probe: lastProbe
          ? {
              ok: false,
              httpStatus: lastProbe.httpStatus,
              reason: lastProbe.reason,
              errorTruncated: lastProbe.errorTruncated,
            }
          : null,
        smoke: null,
        completedCells: [],
        pendingCells: [],
        verdict: 'NO CONCLUYENTE',
        verdictReasons: [abortReason],
      });
      // Fall through to finally (do not process.exit here).
    } else {
    logEvent({
      event: 'bench-smoke-start',
      modelId: MODEL_ID,
      listPrice,
      usageBefore,
      probesUsed,
    });

    const smoke = await runClaudeSmoke({
      modelId: MODEL_ID,
      budget,
      timeoutMs: 120_000,
      maxAttempts: 2,
    });

    logEvent({
      event: 'bench-smoke-done',
      ok: smoke.ok,
      attempts: smoke.attempts.length,
      reason: smoke.reason,
      diagnostics: smoke.attempts,
    });

    if (!smoke.ok) {
      try {
        const keyAfter = await fetchOpenRouterKeySnapshot();
        usageAfter = keyAfter?.usage ?? null;
      } catch {
        usageAfter = null;
      }
      try {
        proxyCount = await proxy.readCount();
      } catch {
        proxyCount = null;
      }

      // If Claude Code rejects the model id, confirm OpenRouter still lists it
      // (public /api/v1/models, no key, outside proxy). Do not pick a substitute.
      let catalog: Awaited<ReturnType<typeof openRouterFreeModelStillListed>> | null =
        null;
      const unrecognized = /unrecognized_model/i.test(smoke.reason ?? '');
      if (unrecognized) {
        catalog = await openRouterFreeModelStillListed(MODEL_ID);
        logEvent({
          event: 'openrouter-model-catalog-check',
          modelId: MODEL_ID,
          listed: catalog.listed,
          freeListed: catalog.freeListed,
          reason: catalog.reason,
        });
      }

      const verdictReasons = [
        'smoke failed after 2 attempts — no valid Claude Code cell',
      ];
      if (catalog && !catalog.listed) {
        verdictReasons.push(
          `OpenRouter catalog: model gone — ${catalog.reason} (no substitute chosen)`,
        );
      } else if (catalog?.listed) {
        verdictReasons.push(
          `OpenRouter catalog: model still listed — ${catalog.reason}; Claude Code host rejected the id`,
        );
      }

      const hops = publicProxyHops(proxy.hops());
      await writeAggregate({
        schema: 'bench-baseline-cheap/v1',
        cheap: true,
        n: N,
        modelId: MODEL_ID,
        listPrice,
        probesUsed,
        pricingVerified: pricing?.ok === true,
        maxSpendUsd: MAX_SPEND_USD,
        maxRequestsPerMinute: MAX_REQUESTS_PER_MINUTE,
        generatedAt: new Date().toISOString(),
        usageBefore,
        usageAfter,
        usageDeltaUsd:
          usageBefore != null && usageAfter != null
            ? usageAfter - usageBefore
            : null,
        proxyRequestCount: proxyCount,
        requestsAlreadyUsed: REQUESTS_ALREADY_USED,
        requestCap: MAX_REQUESTS,
        anthropicBaseUrl: proxy.anthropicBaseUrl,
        /** Upstream HTTP status per hop (no paths). */
        hops,
        aborted: true,
        abortReason: smoke.reason,
        openRouterCatalog: catalog,
        smoke: {
          ok: false,
          attempts: smoke.attempts,
          reason: smoke.reason,
        },
        completedCells: [],
        pendingCells: [],
        invocations: [],
        verdict: 'NO CONCLUYENTE',
        verdictReasons,
      });
      logEvent({
        event: 'bench-baseline-stop',
        reason: 'smoke failed after 2 attempts',
        usageBefore,
        usageAfter,
        proxyRequestCount: proxyCount,
        openRouterCatalog: catalog,
        hops,
      });
      exitCode = 1;
      abortReason = smoke.reason;
      // Fall through to finally so proxy hops are logged and the server closes.
    } else if (SMOKE_ONLY) {
      try {
        const keyAfter = await fetchOpenRouterKeySnapshot();
        usageAfter = keyAfter?.usage ?? null;
      } catch {
        usageAfter = null;
      }
      try {
        proxyCount = await proxy.readCount();
      } catch {
        proxyCount = null;
      }
      await writeAggregate({
        schema: 'bench-baseline-cheap/v1',
        cheap: true,
        smokeOnly: true,
        modelId: MODEL_ID,
        usageBefore,
        usageAfter,
        proxyRequestCount: proxyCount,
        requestsAlreadyUsed: REQUESTS_ALREADY_USED,
        hops: publicProxyHops(proxy.hops()),
        smoke: { ok: true, attempts: smoke.attempts, reason: null },
        verdict: 'NO CONCLUYENTE',
        verdictReasons: ['smoke-only mode — full cheap not run'],
        completedCells: [],
        pendingCells: [],
      });
    } else {
    logEvent({
      event: 'bench-baseline-start',
      cheap: true,
      n: N,
      taskIds: TASK_IDS,
      maxTurns: MAX_TURNS,
      modelId: MODEL_ID,
      listPrice,
      pricing: pricing?.pricing ?? null,
      usageBefore,
      maxSpendUsd: MAX_SPEND_USD,
      probesUsed,
    });

    const result = await runBench({
      projectRoot: PROJECT_ROOT,
      suiteId: 'harness-v1',
      n: N,
      cheap: true,
      live: true,
      seed: SEED,
      modelId: MODEL_ID,
      claim: 'success-only',
      writeReport: true,
      reportDir: OUT_DIR,
      fetchKey: () => fetchOpenRouterKeySnapshot(),
      budget,
      taskIds: TASK_IDS,
      maxTurns: MAX_TURNS,
      maxSpendUsd: MAX_SPEND_USD,
    });

    usageAfter = result.usageAfter;
    if (usageAfter === null) {
      try {
        const keyAfter = await fetchOpenRouterKeySnapshot();
        usageAfter = keyAfter?.usage ?? null;
      } catch {
        // keep null
      }
    }

    try {
      proxyCount = await proxy.readCount();
    } catch {
      proxyCount = null;
    }

    const usageBeforeFinal = result.usageBefore ?? usageBefore;
    const usageDeltaUsd =
      usageBeforeFinal != null && usageAfter != null
        ? usageAfter - usageBeforeFinal
        : null;
    const aggregate = {
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      n: N,
      seed: SEED,
      taskIds: TASK_IDS,
      maxTurns: MAX_TURNS,
      modelId: MODEL_ID,
      listPrice,
      probesUsed,
      pricingVerified: pricing?.ok === true,
      isFreeModel: pricing?.isFree === true,
      supportsTools: pricing?.supportsTools === true,
      maxSpendUsd: MAX_SPEND_USD,
      maxRequestsPerMinute: MAX_REQUESTS_PER_MINUTE,
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      usageBefore: usageBeforeFinal,
      usageAfter,
      usageDeltaUsd,
      proxyRequestCount: proxyCount,
      requestsAlreadyUsed: REQUESTS_ALREADY_USED,
      requestCap: MAX_REQUESTS,
      hops: publicProxyHops(proxy.hops()),
      runValid: result.runValid,
      budget,
      aborted: result.aborted,
      abortReason: result.abortReason,
      contentHash: result.report.contentHash,
      verdict: result.report.verdict,
      verdictReasons: result.report.verdictReasons,
      fingerprints: result.report.fingerprints,
      smoke: { ok: true, attempts: smoke.attempts, reason: null },
      tasks: result.report.tasks.map((t) => ({
        taskId: t.taskId,
        metric: t.metric,
        baselineMedian: t.baseline.median,
        treatmentMedian: t.treatment.median,
        deltaMedian: t.deltaMedian,
        ciLow: t.bootstrap.ciLow,
        ciHigh: t.bootstrap.ciHigh,
        baselineSuccess: `${t.baselineSuccess.k}/${t.baselineSuccess.n}`,
        treatmentSuccess: `${t.treatmentSuccess.k}/${t.treatmentSuccess.n}`,
        nonInferiorityOk: t.nonInferiorityOk,
      })),
      overall: {
        baselineSuccess: `${result.report.overall.baselineSuccess.k}/${result.report.overall.baselineSuccess.n}`,
        treatmentSuccess: `${result.report.overall.treatmentSuccess.k}/${result.report.overall.treatmentSuccess.n}`,
        tokensDeltaMedian: result.report.overall.tokens.deltaMedian,
        tokensCi: [
          result.report.overall.tokens.bootstrap.ciLow,
          result.report.overall.tokens.bootstrap.ciHigh,
        ],
      },
      completedCells: result.report.cells.map((c) => ({
        taskId: c.taskId,
        variant: c.variant,
        repetition: c.repetition,
        success: c.success,
        tokensTotal: c.tokensTotal,
        tokensInput: c.tokensInput,
        tokensOutput: c.tokensOutput,
        costUsd: c.costUsd,
        costBasis: c.costBasis,
        durationMs: c.durationMs,
        modelId: c.modelId,
      })),
      /** In-band: OpenRouter :free Anthropic-table estimates are `unknown`, not provider-billed. */
      costBasisSummary: {
        default: 'unknown',
        note: 'Claude Code total_cost_usd/costUSD on :free OpenRouter routes is an Anthropic list-price estimate, not OpenRouter billed spend',
        byCell: Object.fromEntries(
          [...new Set(result.report.cells.map((c) => c.costBasis ?? 'none'))].map(
            (b) => [
              b,
              result.report.cells.filter((c) => (c.costBasis ?? 'none') === b)
                .length,
            ],
          ),
        ),
      },
      pendingCells: result.pendingCells,
      invocations: result.invocations,
    };

    await writeAggregate(aggregate);
    await writeFile(resolve(OUT_DIR, 'bench-report.md'), result.markdown, 'utf-8');

    logEvent({
      event: 'bench-baseline-done',
      cheap: true,
      modelId: MODEL_ID,
      usageBefore: aggregate.usageBefore,
      usageAfter: aggregate.usageAfter,
      proxyRequestCount: proxyCount,
      completed: aggregate.completedCells.length,
      budget,
      pending: aggregate.pendingCells.length,
      verdict: aggregate.verdict,
      runValid: aggregate.runValid,
      aborted: aggregate.aborted,
      contentHash: aggregate.contentHash,
      outDir: OUT_DIR,
    });

    if (result.aborted && aggregate.completedCells.length === 0) {
      exitCode = 1;
      abortReason = result.abortReason;
    }
    } // end else (full bench after successful smoke)
    } // end else (probe ok → smoke/matrix)
  } catch (err) {
    exitCode = 1;
    abortReason = err instanceof Error ? err.message : String(err);
    try {
      const keyAfter = await fetchOpenRouterKeySnapshot();
      usageAfter = keyAfter?.usage ?? null;
    } catch {
      // ignore
    }
    if (proxy) {
      try {
        proxyCount = await proxy.readCount();
      } catch {
        proxyCount = null;
      }
    }
    await writeAggregate({
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      modelId: MODEL_ID,
      aborted: true,
      abortReason,
      usageBefore,
      usageAfter,
      proxyRequestCount: proxyCount,
      completedCells: [],
      pendingCells: [],
      verdict: 'NO CONCLUYENTE',
      verdictReasons: [abortReason],
    });
  } finally {
    if (proxy) {
      if (proxyCount === null) {
        try {
          proxyCount = await proxy.readCount();
        } catch {
          proxyCount = null;
        }
      }
      logEvent({
        event: 'request-proxy-stopping',
        proxyCount,
        maxRequests: MAX_REQUESTS,
        streamBudgetRequests: budget.requests,
        // method + upstreamStatus only — no paths, tokens, or bodies.
        hops: publicProxyHops(proxy.hops()),
      });
      await proxy.close().catch(() => undefined);
      proxy = null;
    }
  }

  if (exitCode !== 0) {
    logEvent({
      event: 'bench-baseline-failed',
      abortReason,
      budget,
      usageBefore,
      usageAfter,
      proxyRequestCount: proxyCount,
    });
    process.exit(exitCode);
  }
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await writeAggregate({
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      aborted: true,
      abortReason: message,
      usageBefore: null,
      usageAfter: null,
      completedCells: [],
      pendingCells: [],
      verdict: 'NO CONCLUYENTE',
    });
  } catch {
    // ignore
  }
  console.error(`bench-baseline-cheap: ${message}`);
  process.exit(1);
});
