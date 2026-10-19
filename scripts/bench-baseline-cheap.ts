/**
 * Cheap M5 baseline entrypoint for GitHub Actions.
 *
 * - Requires OPENROUTER_API_KEY in env (never printed).
 * - Smoke: `claude -p "di hola" --output-format json` (2 attempts).
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
  ensureClaudeCiConfig,
  runClaudeSmoke,
} from '../src/core/evaluation/bench/host-claude';
import { fetchOpenRouterKeySnapshot } from '../src/core/telemetry/openrouter-spend-lock';

const MODEL_ID =
  process.env.BENCH_MODEL_ID?.trim() ||
  'nvidia/nemotron-3-super-120b-a12b:free';
const OUT_DIR = resolve(process.env.BENCH_OUT_DIR?.trim() || 'bench-out');
const PROJECT_ROOT = resolve(process.env.BENCH_PROJECT_ROOT?.trim() || '.');
const N = Number(process.env.BENCH_N ?? '3');
const SEED = Number(process.env.BENCH_SEED ?? '42');
const SMOKE_ONLY = process.env.BENCH_SMOKE_ONLY === '1';

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

  if (!process.env.OPENROUTER_API_KEY) {
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

  process.env.ANTHROPIC_BASE_URL =
    process.env.ANTHROPIC_BASE_URL || 'https://openrouter.ai/api';
  if (!process.env.ANTHROPIC_AUTH_TOKEN) {
    process.env.ANTHROPIC_AUTH_TOKEN = process.env.OPENROUTER_API_KEY;
  }
  process.env.ANTHROPIC_API_KEY = '';

  await ensureClaudeCiConfig();

  try {
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
      // Capture usage after failed smoke (post-candado).
      try {
        const keyAfter = await fetchOpenRouterKeySnapshot();
        usageAfter = keyAfter?.usage ?? null;
      } catch {
        usageAfter = null;
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
      await writeAggregate({
        schema: 'bench-baseline-cheap/v1',
        cheap: true,
        smokeOnly: true,
        modelId: MODEL_ID,
        usageBefore,
        usageAfter,
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

    const aggregate = {
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      n: N,
      seed: SEED,
      modelId: MODEL_ID,
      pricingVerifiedZero: true,
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      usageBefore: result.usageBefore ?? usageBefore,
      usageAfter,
      runValid: result.runValid,
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
        durationMs: c.durationMs,
        modelId: c.modelId,
      })),
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
      completed: aggregate.completedCells.length,
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
    await writeAggregate({
      schema: 'bench-baseline-cheap/v1',
      cheap: true,
      modelId: MODEL_ID,
      aborted: true,
      abortReason,
      usageBefore,
      usageAfter,
      completedCells: [],
      pendingCells: [],
      verdict: 'NO CONCLUYENTE',
      verdictReasons: [abortReason],
    });
  }

  if (exitCode !== 0) {
    logEvent({
      event: 'bench-baseline-failed',
      abortReason,
      usageBefore,
      usageAfter,
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
