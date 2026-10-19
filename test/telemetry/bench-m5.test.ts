/**
 * M5 bench runner / stats / report — dry-synthetic + injected cells only.
 * Live host baseline remains pending (Arturo launches after review).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  bootstrapMedianDelta,
  summarize,
  taskNonInferiority,
  wilsonInterval,
} from '../../src/core/evaluation/bench/stats';
import {
  buildBenchReport,
  minRepetitionsForMode,
  type BenchRunCell,
} from '../../src/core/evaluation/bench/report';
import {
  runBench,
  synthesizeDryCells,
} from '../../src/core/evaluation/bench/runner';
import { assertOpenRouterModelFreeZeroPrice } from '../../src/core/evaluation/bench/openrouter-free-model';
import { sanitizeStderr } from '../../src/core/evaluation/bench/host-claude';
import type { OpenRouterKeySnapshot } from '../../src/core/telemetry/openrouter-spend-lock';
import { loadHarnessSuite } from '../../src/core/evaluation/harness-experiment';
import { scorecardCommand } from '../../src/commands/scorecard.command';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const SUITE_PATH = resolve(REPO_ROOT, 'eval/suites/harness-v1/suite.yml');

const FREE_KEY: OpenRouterKeySnapshot = {
  limit: 5,
  limitRemaining: 5,
  usage: 0,
  isFreeTier: true,
  label: 'test-free',
};

function cell(
  partial: Partial<BenchRunCell> &
    Pick<BenchRunCell, 'taskId' | 'variant' | 'repetition' | 'tokensTotal'>,
): BenchRunCell {
  return {
    success: true,
    iterations: 1,
    retries: 0,
    calls: 1,
    tokensInput: Math.floor(partial.tokensTotal * 0.8),
    tokensOutput: Math.floor(partial.tokensTotal * 0.2),
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    costUsd: 0,
    durationMs: 100,
    cacheHitRate: 0,
    firstTry: true,
    modelId: 'fake',
    hostVersion: null,
    ...partial,
  };
}

describe('M5 stats (§3.2)', () => {
  test('summarize returns median and IQR', () => {
    const s = summarize([1, 2, 3, 4, 5]);
    expect(s.n).toBe(5);
    expect(s.median).toBe(3);
    expect(s.q1).toBe(2);
    expect(s.q3).toBe(4);
    expect(s.iqr).toBe(2);
  });

  test('bootstrapMedianDelta is deterministic for a fixed seed', () => {
    const a = bootstrapMedianDelta([100, 110, 120, 130, 140], [80, 85, 90, 95, 100], {
      samples: 500,
      seed: 7,
    });
    const b = bootstrapMedianDelta([100, 110, 120, 130, 140], [80, 85, 90, 95, 100], {
      samples: 500,
      seed: 7,
    });
    expect(a.deltaMedian).toBe(b.deltaMedian);
    expect(a.ciLow).toBe(b.ciLow);
    expect(a.ciHigh).toBe(b.ciHigh);
    expect(a.entirelyBelowZero).toBe(true);
    expect(a.crossesZero).toBe(false);
  });

  test('wilsonInterval covers a known proportion', () => {
    const w = wilsonInterval(4, 5);
    expect(w.p).toBeCloseTo(0.8);
    expect(w.low).toBeGreaterThan(0);
    expect(w.high).toBeLessThan(1);
    expect(w.low).toBeLessThan(w.p);
    expect(w.high).toBeGreaterThan(w.p);
  });

  test('taskNonInferiority rejects ≥4/5 → ≤2/5', () => {
    expect(taskNonInferiority(4, 5, 2, 5).ok).toBe(false);
    expect(taskNonInferiority(4, 5, 3, 5).ok).toBe(true);
    expect(taskNonInferiority(3, 5, 2, 5).ok).toBe(true);
  });
});

describe('M5 report verdicts (§3.3)', () => {
  const tasks = ['t1', 't2'];

  function makeCells(
    baseTokens: number,
    treatTokens: number,
    treatSuccess = true,
  ): BenchRunCell[] {
    const out: BenchRunCell[] = [];
    for (const taskId of tasks) {
      for (let rep = 1; rep <= 5; rep++) {
        out.push(
          cell({
            taskId,
            variant: 'baseline',
            repetition: rep,
            tokensTotal: baseTokens + rep,
            success: true,
          }),
        );
        out.push(
          cell({
            taskId,
            variant: 'treatment',
            repetition: rep,
            tokensTotal: treatTokens + rep,
            success: treatSuccess,
          }),
        );
      }
    }
    return out;
  }

  test('success-only ACEPTA when treatment succeeds', () => {
    const report = buildBenchReport({
      suiteId: 'harness-v1',
      cells: makeCells(1000, 900),
      claim: 'success-only',
      seed: 1,
      bootstrapSamples: 200,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    expect(report.verdict).toBe('ACEPTA');
    expect(report.schema).toBe('bench-report/v1');
  });

  test('N=1 with clear delta is NO CONCLUYENTE (IC degenerates)', () => {
    const cells: BenchRunCell[] = [
      cell({
        taskId: 't1',
        variant: 'baseline',
        repetition: 1,
        tokensTotal: 1000,
      }),
      cell({
        taskId: 't1',
        variant: 'treatment',
        repetition: 1,
        tokensTotal: 500,
      }),
    ];
    const report = buildBenchReport({
      suiteId: 'harness-v1',
      cells,
      claim: 'efficiency',
      seed: 1,
      bootstrapSamples: 200,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    expect(report.n).toBe(1);
    expect(report.verdict).toBe('NO CONCLUYENTE');
    expect(report.verdictReasons.some((r) => /below minimum/i.test(r))).toBe(
      true,
    );
  });

  test('empty cells (0/0) is NO CONCLUYENTE not RECHAZA', () => {
    const report = buildBenchReport({
      suiteId: 'harness-v1',
      cells: [],
      claim: 'success-only',
      cheap: true,
      seed: 1,
      bootstrapSamples: 50,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    expect(report.verdict).toBe('NO CONCLUYENTE');
    expect(report.verdict).not.toBe('RECHAZA');
    expect(report.verdictReasons.some((r) => /no completed cells/i.test(r))).toBe(
      true,
    );
  });

  test('cheap mode requires N≥3; N=2 → NO CONCLUYENTE', () => {
    const cells: BenchRunCell[] = [];
    for (let rep = 1; rep <= 2; rep++) {
      cells.push(
        cell({
          taskId: 't1',
          variant: 'baseline',
          repetition: rep,
          tokensTotal: 1000,
        }),
        cell({
          taskId: 't1',
          variant: 'treatment',
          repetition: rep,
          tokensTotal: 500,
        }),
      );
    }
    const report = buildBenchReport({
      suiteId: 'harness-v1',
      cells,
      claim: 'success-only',
      cheap: true,
      seed: 1,
      bootstrapSamples: 50,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    expect(report.n).toBe(2);
    expect(report.verdict).toBe('NO CONCLUYENTE');
  });

  test('RECHAZA when success drops', () => {
    const report = buildBenchReport({
      suiteId: 'harness-v1',
      cells: makeCells(1000, 900, false),
      claim: 'success-only',
      seed: 1,
      bootstrapSamples: 200,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    expect(report.verdict).toBe('RECHAZA');
  });

  test('efficiency ACEPTA when tokens drop ≥10% with IC < 0', () => {
    const report = buildBenchReport({
      suiteId: 'harness-v1',
      cells: makeCells(1000, 700),
      claim: 'efficiency',
      efficiencyThreshold: 0.1,
      seed: 1,
      bootstrapSamples: 500,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    expect(report.verdict).toBe('ACEPTA');
    expect(report.overall.tokens.bootstrap.entirelyBelowZero).toBe(true);
  });

  test('efficiency NO CONCLUYENTE when IC crosses 0', () => {
    // Nearly identical arms → bootstrap CI crosses 0.
    const cells: BenchRunCell[] = [];
    for (const taskId of tasks) {
      for (let rep = 1; rep <= 5; rep++) {
        cells.push(
          cell({
            taskId,
            variant: 'baseline',
            repetition: rep,
            tokensTotal: 1000 + (rep % 2 === 0 ? 20 : -20),
          }),
        );
        cells.push(
          cell({
            taskId,
            variant: 'treatment',
            repetition: rep,
            tokensTotal: 1000 + (rep % 2 === 0 ? -15 : 15),
          }),
        );
      }
    }
    const report = buildBenchReport({
      suiteId: 'harness-v1',
      cells,
      claim: 'efficiency',
      seed: 1,
      bootstrapSamples: 500,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    expect(report.verdict).toBe('NO CONCLUYENTE');
  });

  test('contentHash is stable for the same cells', () => {
    const cells = makeCells(1000, 900);
    const a = buildBenchReport({
      suiteId: 'harness-v1',
      cells,
      seed: 1,
      bootstrapSamples: 50,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
    const b = buildBenchReport({
      suiteId: 'harness-v1',
      cells,
      seed: 1,
      bootstrapSamples: 50,
      generatedAt: '2026-10-20T00:00:00.000Z',
    });
    expect(a.contentHash).toBe(b.contentHash);
  });
});

describe('M5 suite harness-v1 (+2 tasks)', () => {
  test('loads 5 tasks including review and out-of-scope', async () => {
    const suite = await loadHarnessSuite(REPO_ROOT, 'harness-v1', SUITE_PATH);
    expect(suite.success).toBe(true);
    if (!suite.success) return;
    expect(suite.data.tasks.map((t) => t.id)).toEqual([
      'fix-add-off-by-one',
      'feature-multiply',
      'refactor-greet',
      'review-seeded-bug',
      'out-of-scope-guard',
    ]);
    expect(suite.data.tasks.find((t) => t.id === 'review-seeded-bug')?.type).toBe(
      'review',
    );
  });
});

describe('M5 runner (dry / fake provider)', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test('drySynthetic N=5 produces 5 tasks × 2 variants × 5 reps', async () => {
    const reportDir = await mkdtemp(join(tmpdir(), 'cc-bench-rep-'));
    dirs.push(reportDir);
    const result = await runBench({
      projectRoot: REPO_ROOT,
      suitePath: SUITE_PATH,
      drySynthetic: true,
      n: 5,
      seed: 42,
      reportDir,
      writeReport: true,
    });
    expect(result.aborted).toBe(false);
    expect(result.runValid).toBe(true);
    expect(result.report.n).toBe(5);
    expect(result.report.cells).toHaveLength(5 * 2 * 5);
    expect(result.reportPath).not.toBeNull();
    const raw = JSON.parse(await readFile(result.reportPath!, 'utf-8'));
    expect(raw.schema).toBe('bench-report/v1');
    expect(raw.contentHash).toBe(result.report.contentHash);
    expect(result.markdown).toContain('Verdict:');
  });

  test('cheap defaults to N=3 and enforces OpenRouter lock', async () => {
    const reportDir = await mkdtemp(join(tmpdir(), 'cc-bench-cheap-'));
    dirs.push(reportDir);
    const result = await runBench({
      projectRoot: REPO_ROOT,
      suitePath: SUITE_PATH,
      drySynthetic: true,
      cheap: true,
      seed: 3,
      reportDir,
      keyBefore: FREE_KEY,
      keyAfter: FREE_KEY,
      modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    });
    expect(result.aborted).toBe(false);
    expect(result.runValid).toBe(true);
    expect(result.report.cheap).toBe(true);
    expect(result.report.n).toBe(3);
    expect(result.report.cells).toHaveLength(5 * 2 * 3);
  });

  test('cheap aborts when model is not :free', async () => {
    const result = await runBench({
      projectRoot: REPO_ROOT,
      suitePath: SUITE_PATH,
      drySynthetic: true,
      cheap: true,
      keyBefore: FREE_KEY,
      keyAfter: FREE_KEY,
      modelId: 'anthropic/claude-sonnet-4',
      writeReport: false,
    });
    expect(result.aborted).toBe(true);
    expect(result.runValid).toBe(false);
    expect(result.abortReason).toMatch(/:free/i);
  });

  test('cheap aborts when usage rises between tasks', async () => {
    let calls = 0;
    const result = await runBench({
      projectRoot: REPO_ROOT,
      suitePath: SUITE_PATH,
      drySynthetic: true,
      cheap: true,
      keyBefore: FREE_KEY,
      fetchKey: async () => {
        calls += 1;
        // First resolve for pre-run uses keyBefore; between-task uses fetchKey.
        return { ...FREE_KEY, usage: calls === 1 ? 0 : 0.01 };
      },
      modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
      writeReport: false,
    });
    expect(result.aborted).toBe(true);
    expect(result.runValid).toBe(false);
    expect(result.abortReason).toMatch(/usage|Δ|delta|spend/i);
  });

  test('cellsPath replays a fake provider schedule', async () => {
    const reportDir = await mkdtemp(join(tmpdir(), 'cc-bench-cells-'));
    dirs.push(reportDir);
    const cells = synthesizeDryCells(
      ['fix-add-off-by-one', 'feature-multiply'],
      3,
      99,
    );
    const cellsPath = join(reportDir, 'cells.json');
    await writeFile(cellsPath, JSON.stringify(cells), 'utf-8');
    const result = await runBench({
      projectRoot: REPO_ROOT,
      suitePath: SUITE_PATH,
      cellsPath,
      n: 3,
      seed: 99,
      reportDir,
    });
    expect(result.aborted).toBe(false);
    expect(result.report.cells).toHaveLength(cells.length);
    expect(result.report.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('M5 free-model pricing gate', () => {
  test('minRepetitionsForMode is 3 cheap / 5 normal', () => {
    expect(minRepetitionsForMode(true)).toBe(3);
    expect(minRepetitionsForMode(false)).toBe(5);
  });

  test('sanitizeStderr redacts keys and truncates', () => {
    const raw =
      'Bearer sk-or-v1-abcdefghijklmnopqrstuvwxyz012345 OPENROUTER_API_KEY=sk-or-v1-abc ' +
      'x'.repeat(600);
    const s = sanitizeStderr(raw, 200);
    expect(s).not.toContain('sk-or-v1-abc');
    expect(s).toContain('[REDACTED');
    expect(s.length).toBeLessThanOrEqual(201);
  });

  test('rejects non-:free and non-zero pricing', async () => {
    const paid = await assertOpenRouterModelFreeZeroPrice('anthropic/claude-sonnet-4', {
      apiKey: 'test',
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
    });
    expect(paid.ok).toBe(false);

    const free = await assertOpenRouterModelFreeZeroPrice(
      'nvidia/nemotron-3-super-120b-a12b:free',
      {
        apiKey: 'test',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 'nvidia/nemotron-3-super-120b-a12b:free',
                  pricing: { prompt: '0', completion: '0' },
                },
              ],
            }),
            { status: 200 },
          ),
      },
    );
    expect(free.ok).toBe(true);
    expect(free.pricing).toEqual({ prompt: 0, completion: 0 });
  });
});

describe('M5 scorecard bench CLI', () => {
  test('scorecard bench run --dry-synthetic returns a report', async () => {
    const result = await scorecardCommand({
      subcommand: 'bench',
      projectRoot: REPO_ROOT,
      suitePath: SUITE_PATH,
      benchAction: 'run',
      drySynthetic: true,
      repetitions: 3,
      seed: 11,
    });
    expect(result.code).toBeLessThanOrEqual(1);
    const data = result.data as {
      success: boolean;
      contentHash?: string;
      verdict?: string;
      report?: { schema: string; n: number };
    };
    expect(data.success).toBe(true);
    expect(data.report?.schema).toBe('bench-report/v1');
    expect(data.report?.n).toBe(3);
    expect(data.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(['ACEPTA', 'RECHAZA', 'NO CONCLUYENTE']).toContain(data.verdict);
  });
});
