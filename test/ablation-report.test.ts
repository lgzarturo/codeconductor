import { describe, expect, test } from 'bun:test';
import { classifyAblation, buildAblationReport } from '../src/core/evaluation/ablation-report';
import type { TaskOutcomeInput } from '../src/validation/schemas';

function outcome(partial: Partial<TaskOutcomeInput> & Pick<TaskOutcomeInput, 'id' | 'variantId'>): TaskOutcomeInput {
  return {
    taskId: partial.suiteTaskId ?? 'fix-add-off-by-one',
    source: 'manual',
    agent: 'reviewer',
    model: 'test-model',
    contractVersion: '1.0.0',
    timestamp: '2026-08-28T00:00:00Z',
    ...partial,
  };
}

describe('ablation-report', () => {
  test('classifyAblation uses fixed thresholds', () => {
    expect(classifyAblation(0.02, 0.01)).toBe('no_change');
    expect(classifyAblation(-0.2, 0)).toBe('degrades');
    expect(classifyAblation(0.2, 0)).toBe('improves');
    expect(classifyAblation(0.02, -0.1)).toBe('degrades');
    expect(classifyAblation(0.02, 0.1)).toBe('improves');
  });

  test('pairs baseline vs minus:review on the same suite task', async () => {
    const outcomes: TaskOutcomeInput[] = [
      outcome({
        id: 'b1',
        experimentId: 'abl-1',
        variantId: 'baseline',
        suiteTaskId: 'fix-add-off-by-one',
        verdict: 'PASS',
        weightedScore: 2.4,
        costUsd: 0.2,
        durationMs: 1000,
      }),
      outcome({
        id: 't1',
        experimentId: 'abl-1',
        variantId: 'minus:review',
        suiteTaskId: 'fix-add-off-by-one',
        disabledComponents: ['review'],
        verdict: 'REVISE',
        weightedScore: 2.0,
        costUsd: 0.1,
        durationMs: 800,
      }),
    ];
    const report = await buildAblationReport('/tmp', outcomes, 'abl-1');
    expect(report.rows).toHaveLength(1);
    const row = report.rows[0]!;
    expect(row.component).toBe('review');
    expect(row.verdict).toBe('degrades');
    expect(row.deltaScore).toBeCloseTo(-0.4);
    expect(row.deltaPassRate).toBeCloseTo(-1);
    expect(row.deltaCost).toBeCloseTo(-0.1);
  });

  test('no_change when deltas stay inside thresholds', async () => {
    const outcomes: TaskOutcomeInput[] = [
      outcome({
        id: 'b1',
        experimentId: 'abl-1',
        variantId: 'baseline',
        suiteTaskId: 'feature-multiply',
        verdict: 'PASS',
        weightedScore: 2.2,
      }),
      outcome({
        id: 't1',
        experimentId: 'abl-1',
        variantId: 'minus:docs',
        suiteTaskId: 'feature-multiply',
        disabledComponents: ['docs'],
        verdict: 'PASS',
        weightedScore: 2.22,
      }),
    ];
    const report = await buildAblationReport('/tmp', outcomes, 'abl-1');
    expect(report.rows[0]?.verdict).toBe('no_change');
  });
});

test('BC-028 unavailable criterion scores are omitted from ablation averages', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { saveScorecard } = await import('../src/core/evaluation/outcome-store');
  const { buildScorecardRecord, createDefaultCriteria } = await import('../src/core/evaluation/scorecard-calculator');
  const root = await mkdtemp(join(tmpdir(), 'cc-bc028-ablation-'));
  try {
    for (const [id, score] of [['missing', null], ['measured', 3]] as const) {
      const saved = await saveScorecard(root, buildScorecardRecord({
        id, taskId: 'task', agent: 'reviewer', contractVersion: '1',
        criteria: createDefaultCriteria({ tests: { score } }),
      }));
      expect(saved.success).toBe(true);
    }
    const report = await buildAblationReport(root, [
      outcome({ id: 'b1', variantId: 'baseline', scorecardId: 'missing' }),
      outcome({ id: 'b2', variantId: 'baseline', scorecardId: 'measured' }),
      outcome({ id: 't1', variantId: 'minus:review', scorecardId: 'missing' }),
    ]);
    expect(report.rows[0]?.baseline.criteria?.tests).toBe(3);
    expect(report.rows[0]?.treatment.criteria?.tests).toBeUndefined();
    expect(report.rows[0]?.deltaCriteria?.tests).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
