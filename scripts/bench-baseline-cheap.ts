/**
 * Cheap M5 baseline entrypoint for GitHub Actions.
 *
 * - Requires OPENROUTER_API_KEY in env (never printed).
 * - Verifies model is :free with list price 0 via /api/v1/models.
 * - Enforces M3 spend lock before run + between tasks (via runBench).
 * - Writes sanitized aggregates only (§7) under BENCH_OUT_DIR.
 *
 * Usage:
 *   bun run scripts/bench-baseline-cheap.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBench } from '../src/core/evaluation/bench/runner';
import { assertOpenRouterModelFreeZeroPrice } from '../src/core/evaluation/bench/openrouter-free-model';
import { fetchOpenRouterKeySnapshot } from '../src/core/telemetry/openrouter-spend-lock';

const MODEL_ID =
  process.env.BENCH_MODEL_ID?.trim() ||
  'nvidia/nemotron-3-super-120b-a12b:free';
const OUT_DIR = resolve(
  process.env.BENCH_OUT_DIR?.trim() || 'bench-out',
);
const PROJECT_ROOT = resolve(process.env.BENCH_PROJECT_ROOT?.trim() || '.');
const N = Number(process.env.BENCH_N ?? '3');
const SEED = Number(process.env.BENCH_SEED ?? '42');

function fail(message: string, code = 1): never {
  // Never include env values — message must be free of secrets.
  console.error(`bench-baseline-cheap: ${message}`);
  process.exit(code);
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    fail(
      'OPENROUTER_API_KEY secret is not available in this environment — aborting (no alternate key source)',
    );
  }

  // Wire Claude Code → OpenRouter without echoing the token.
  process.env.ANTHROPIC_BASE_URL =
    process.env.ANTHROPIC_BASE_URL || 'https://openrouter.ai/api';
  if (!process.env.ANTHROPIC_AUTH_TOKEN) {
    process.env.ANTHROPIC_AUTH_TOKEN = process.env.OPENROUTER_API_KEY;
  }
  // Empty API key forces Claude Code to use AUTH_TOKEN path.
  process.env.ANTHROPIC_API_KEY = '';

  const pricing = await assertOpenRouterModelFreeZeroPrice(MODEL_ID);
  if (!pricing.ok) {
    fail(pricing.reason ?? 'free-model pricing check failed');
  }

  const keyBefore = await fetchOpenRouterKeySnapshot();
  if (!keyBefore) {
    fail('could not read OpenRouter /api/v1/key before run');
  }

  console.log(
    JSON.stringify({
      event: 'bench-baseline-start',
      cheap: true,
      n: N,
      modelId: MODEL_ID,
      pricing: pricing.pricing,
      usageBefore: keyBefore.usage,
      limit: keyBefore.limit,
      // Never log the key or token.
    }),
  );

  const result = await runBench({
    projectRoot: PROJECT_ROOT,
    suiteId: 'harness-v1',
    n: N,
    cheap: true,
    live: true,
    seed: SEED,
    modelId: MODEL_ID,
    claim: 'success-only',
    writeReport: false,
    fetchKey: () => fetchOpenRouterKeySnapshot(),
  });

  const keyAfter =
    result.usageAfter !== null
      ? { usage: result.usageAfter }
      : await fetchOpenRouterKeySnapshot();

  await mkdir(OUT_DIR, { recursive: true });

  // Sanitized aggregate only — no prompts, session ids, raw host JSON, or keys (§7).
  const aggregate = {
    schema: 'bench-baseline-cheap/v1',
    cheap: true,
    n: N,
    seed: SEED,
    modelId: MODEL_ID,
    pricingVerifiedZero: true,
    generatedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    usageBefore: result.usageBefore ?? keyBefore.usage,
    usageAfter:
      typeof keyAfter === 'object' && keyAfter && 'usage' in keyAfter
        ? keyAfter.usage
        : result.usageAfter,
    runValid: result.runValid,
    aborted: result.aborted,
    abortReason: result.abortReason,
    contentHash: result.report.contentHash,
    verdict: result.report.verdict,
    verdictReasons: result.report.verdictReasons,
    fingerprints: result.report.fingerprints,
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
  };

  await writeFile(
    resolve(OUT_DIR, 'bench-baseline-cheap.json'),
    JSON.stringify(aggregate, null, 2),
    'utf-8',
  );
  await writeFile(
    resolve(OUT_DIR, 'bench-report.md'),
    result.markdown,
    'utf-8',
  );

  console.log(
    JSON.stringify({
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
    }),
  );

  if (result.aborted && aggregate.completedCells.length === 0) {
    fail(result.abortReason ?? 'bench aborted with no completed cells');
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
