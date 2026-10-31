/**
 * Local M5 bench with Claude Code (no OpenRouter, no proxy).
 *
 * - Auth: CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY (never printed).
 * - Each Claude call gets an isolated CLAUDE_CONFIG_DIR (trusted cwd only), so
 *   the user's ~/.claude plugins/hooks/CLAUDE.md never reach either arm.
 * - Stops at BENCH_MAX_REQUESTS (stream meter) or BENCH_MAX_SPEND_USD
 *   (summed host total_cost_usd + per-cell --max-budget-usd).
 *
 * Usage:
 *   BENCH_MODEL=haiku BENCH_MODE=sonda bun run bench:local
 *   BENCH_MODEL=opus BENCH_MODE=matrix BENCH_N=3 bun run bench:local
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBench } from '../src/core/evaluation/bench/runner';
import {
  createBenchBudget,
  resolveAnthropicModel,
  runClaudeSmoke,
} from '../src/core/evaluation/bench/host-claude';

const MODEL_ALIAS = process.env.BENCH_MODEL?.trim() || 'sonnet';
const MODEL_ID = resolveAnthropicModel(MODEL_ALIAS);
const MODE = process.env.BENCH_MODE?.trim() || 'sonda';
const SONDA = MODE === 'sonda';
const N = Number(process.env.BENCH_N ?? (SONDA ? '1' : '3'));
const MAX_TURNS = Number(process.env.BENCH_MAX_TURNS ?? '12');
const TASK_IDS = (process.env.BENCH_TASK_IDS ?? 'fix-add-off-by-one')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_TOKENS = Number(process.env.BENCH_MAX_TOKENS ?? '2000000');
const MAX_REQUESTS = Number(process.env.BENCH_MAX_REQUESTS ?? '100');
const MAX_SPEND_USD = Number(process.env.BENCH_MAX_SPEND_USD ?? '2');
const SEED = Number(process.env.BENCH_SEED ?? '42');
const OUT_DIR = resolve(
  process.env.BENCH_OUT_DIR?.trim() || `bench-out/local-${MODEL_ALIAS}`,
);
const PROJECT_ROOT = resolve(process.env.BENCH_PROJECT_ROOT?.trim() || '.');

function logEvent(payload: Record<string, unknown>): void {
  // Never include env values / secrets.
  console.log(JSON.stringify(payload));
}

async function writeAggregate(payload: Record<string, unknown>): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    resolve(OUT_DIR, 'bench-local.json'),
    JSON.stringify({ schema: 'bench-local/v1', modelId: MODEL_ID, mode: MODE, ...payload }, null, 2),
    'utf-8',
  );
}

async function fail(abortReason: string, extra: Record<string, unknown> = {}): Promise<never> {
  await writeAggregate({ aborted: true, abortReason, verdict: 'NO CONCLUYENTE', ...extra });
  logEvent({ event: 'bench-local-failed', abortReason });
  process.exit(1);
}

async function main(): Promise<void> {
  if (MODE !== 'sonda' && MODE !== 'matrix') {
    await fail(`BENCH_MODE must be sonda or matrix (got ${MODE})`);
  }
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() && !process.env.ANTHROPIC_API_KEY?.trim()) {
    await fail('set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
  }
  if (!process.env.CLAUDE_CODE_VERSION) {
    const v = spawnSync('claude', ['--version'], { encoding: 'utf-8' });
    process.env.CLAUDE_CODE_VERSION = v.stdout?.trim().split('\n')[0] || 'unknown';
  }

  const budget = createBenchBudget(MAX_TOKENS, MAX_REQUESTS);
  logEvent({
    event: 'bench-local-start',
    modelId: MODEL_ID,
    mode: MODE,
    n: N,
    maxTurns: MAX_TURNS,
    taskIds: TASK_IDS,
    maxRequests: MAX_REQUESTS,
    maxSpendUsd: MAX_SPEND_USD,
    hostVersion: process.env.CLAUDE_CODE_VERSION,
    outDir: OUT_DIR,
  });

  const smoke = await runClaudeSmoke({
    modelId: MODEL_ID,
    budget,
    timeoutMs: 120_000,
    maxAttempts: 2,
    provider: 'anthropic',
  });
  logEvent({ event: 'bench-smoke-done', ok: smoke.ok, reason: smoke.reason });
  if (!smoke.ok) {
    await fail(smoke.reason ?? 'smoke failed', { smoke, budget });
  }

  const result = await runBench({
    projectRoot: PROJECT_ROOT,
    suiteId: 'harness-v1',
    n: N,
    live: true,
    provider: 'anthropic',
    seed: SEED,
    modelId: MODEL_ID,
    claim: 'success-only',
    writeReport: true,
    reportDir: OUT_DIR,
    budget,
    taskIds: TASK_IDS,
    maxTurns: MAX_TURNS,
    maxSpendUsd: MAX_SPEND_USD,
    maxLiveCells: SONDA ? 1 : undefined,
    variants: SONDA ? ['baseline'] : undefined,
  });

  const completedCells = result.report.cells.map((c) => ({
    taskId: c.taskId,
    variant: c.variant,
    repetition: c.repetition,
    success: c.success,
    tokensTotal: c.tokensTotal,
    costUsd: c.costUsd,
    durationMs: c.durationMs,
  }));
  // Same sonda gate as CI: ≥1 successful baseline cell or stop.
  const sondaOk = SONDA
    ? completedCells.some((c) => c.variant === 'baseline' && c.success)
    : null;
  const verdict = sondaOk === false ? 'NO CONCLUYENTE' : result.report.verdict;

  await writeAggregate({
    n: N,
    seed: SEED,
    taskIds: TASK_IDS,
    maxTurns: MAX_TURNS,
    maxSpendUsd: MAX_SPEND_USD,
    generatedAt: new Date().toISOString(),
    runValid: result.runValid,
    aborted: result.aborted,
    abortReason: result.abortReason,
    budget,
    contentHash: result.report.contentHash,
    verdict,
    verdictReasons:
      sondaOk === false
        ? ['sonda failed — no successful baseline cell; matrix not authorized']
        : result.report.verdictReasons,
    fingerprints: result.report.fingerprints,
    smoke: { ok: true, attempts: smoke.attempts },
    sonda: SONDA ? { ok: sondaOk, required: 'baseline cell with success=true' } : null,
    completedCells,
    pendingCells: result.pendingCells,
    invocations: result.invocations,
  });

  logEvent({
    event: 'bench-local-done',
    verdict,
    sondaOk,
    completed: completedCells.length,
    pending: result.pendingCells.length,
    spentUsd: completedCells.reduce((sum, c) => sum + (c.costUsd ?? 0), 0),
    budget,
    aborted: result.aborted,
    abortReason: result.abortReason,
    outDir: OUT_DIR,
  });

  if (sondaOk === false || (result.aborted && completedCells.length === 0)) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  await fail(err instanceof Error ? err.message : String(err)).catch(() => process.exit(1));
});
