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
import { assertOpenRouterModelFreeZeroPrice } from '../src/core/evaluation/bench/openrouter-free-model';
import {
  createBenchBudget,
  ensureClaudeCiConfig,
  runClaudeSmoke,
} from '../src/core/evaluation/bench/host-claude';
import {
  DEFAULT_OPENROUTER_REQUEST_CAP,
  defaultRequestCounterPath,
  mintProxyLocalToken,
  startOpenRouterRequestProxy,
  type OpenRouterRequestProxy,
} from '../src/core/evaluation/bench/openrouter-request-proxy';
import { fetchOpenRouterKeySnapshot } from '../src/core/telemetry/openrouter-spend-lock';

const MODEL_ID =
  process.env.BENCH_MODEL_ID?.trim() ||
  'nvidia/nemotron-3-super-120b-a12b:free';
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
// Hard per-run caps (smoke + all cells). Proxy rejects request max+1; Claude is also killed on stream budget.
const MAX_TOKENS = Number(process.env.BENCH_MAX_TOKENS ?? '2000000');
const MAX_REQUESTS = Number(
  process.env.BENCH_MAX_REQUESTS ?? String(DEFAULT_OPENROUTER_REQUEST_CAP),
);

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

  await ensureClaudeCiConfig();
  const budget = createBenchBudget(MAX_TOKENS, MAX_REQUESTS);

  let proxy: OpenRouterRequestProxy | null = null;
  try {
    const counterPath =
      process.env.BENCH_REQUEST_COUNTER_PATH?.trim() ||
      defaultRequestCounterPath(`m5-${Date.now()}`);
    try {
      proxy = await startOpenRouterRequestProxy({
        counterPath,
        maxRequests: MAX_REQUESTS,
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
    process.env.ANTHROPIC_BASE_URL = proxy.url;
    logEvent({
      event: 'request-proxy-started',
      maxRequests: MAX_REQUESTS,
      counterPath,
      proxyHost: proxy.host,
      proxyPort: proxy.port,
      taskIds: TASK_IDS,
      n: N,
      maxTurns: MAX_TURNS,
    });

    const keyBefore = await fetchOpenRouterKeySnapshot();
    usageBefore = keyBefore?.usage ?? null;

    const pricing = await assertOpenRouterModelFreeZeroPrice(MODEL_ID);
    if (!pricing.ok) {
      abortReason = pricing.reason ?? 'free-model pricing check failed';
      exitCode = 1;
      await writeAggregate({
        schema: 'bench-baseline-cheap/v1',
        cheap: true,
        modelId: MODEL_ID,
        aborted: true,
        abortReason,
        usageBefore,
        usageAfter: null,
        completedCells: [],
        pendingCells: [],
        smoke: null,
        verdict: 'NO CONCLUYENTE',
      });
      process.exit(1);
    }

    logEvent({
      event: 'bench-smoke-start',
      modelId: MODEL_ID,
      usageBefore,
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
      await writeAggregate({
        schema: 'bench-baseline-cheap/v1',
        cheap: true,
        n: N,
        modelId: MODEL_ID,
        pricingVerifiedZero: true,
        generatedAt: new Date().toISOString(),
        usageBefore,
        usageAfter,
        proxyRequestCount: proxyCount,
        aborted: true,
        abortReason: smoke.reason,
        smoke: {
          ok: false,
          attempts: smoke.attempts,
          reason: smoke.reason,
        },
        completedCells: [],
        pendingCells: [],
        invocations: [],
        verdict: 'NO CONCLUYENTE',
        verdictReasons: [
          'smoke failed after 2 attempts — no valid Claude Code cell',
        ],
      });
      logEvent({
        event: 'bench-baseline-stop',
        reason: 'smoke failed after 2 attempts',
        usageBefore,
        usageAfter,
        proxyRequestCount: proxyCount,
      });
      process.exit(1);
    }

    if (SMOKE_ONLY) {
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
        smoke: { ok: true, attempts: smoke.attempts, reason: null },
        verdict: 'NO CONCLUYENTE',
        verdictReasons: ['smoke-only mode — full cheap not run'],
        completedCells: [],
        pendingCells: [],
      });
      process.exit(0);
    }

    logEvent({
      event: 'bench-baseline-start',
      cheap: true,
      n: N,
      taskIds: TASK_IDS,
      maxTurns: MAX_TURNS,
      modelId: MODEL_ID,
      pricing: pricing.pricing,
      usageBefore,
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

    const aggregate = {
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      n: N,
      seed: SEED,
      taskIds: TASK_IDS,
      maxTurns: MAX_TURNS,
      modelId: MODEL_ID,
      pricingVerifiedZero: true,
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      usageBefore: result.usageBefore ?? usageBefore,
      usageAfter,
      proxyRequestCount: proxyCount,
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
