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
