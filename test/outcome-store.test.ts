/**
 * Tests for outcome store.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendOutcome,
  listOutcomes,
  saveScorecard,
  loadScorecard,
  aggregateOutcomes,
  generateEvalId,
} from '../src/core/evaluation/outcome-store';
import { createDefaultCriteria, buildScorecardRecord } from '../src/core/evaluation/scorecard-calculator';

let TEST_DIR: string;

describe('outcome-store', () => {
  beforeEach(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-eval-test-'));
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('appendOutcome and listOutcomes round-trip', async () => {
    const id = generateEvalId('out');
    const outcome = {
      id,
      taskId: 'BC-001',
      source: 'openspec' as const,
      agent: 'reviewer',
      model: 'mimo-v2.5',
      contractVersion: '0.4.3',
      timestamp: new Date().toISOString(),
      verdict: 'PASS' as const,
      weightedScore: 2.5,
      backlogId: 'BC-001',
    };
    const write = await appendOutcome(TEST_DIR, outcome);
    expect(write.success).toBe(true);

    const list = await listOutcomes(TEST_DIR, { agent: 'reviewer' });
    expect(list.success).toBe(true);
    if (!list.success) return;
    expect(list.data.length).toBe(1);
    expect(list.data[0].id).toBe(id);
  });

  test('saveScorecard and loadScorecard', async () => {
    const criteria = createDefaultCriteria();
    const record = buildScorecardRecord({
      id: 'sc-001',
      taskId: 'BC-001',
      agent: 'reviewer',
      contractVersion: '0.4.3',
      criteria,
    });
    const save = await saveScorecard(TEST_DIR, record);
    expect(save.success).toBe(true);

    const load = await loadScorecard(TEST_DIR, 'sc-001');
    expect(load.success).toBe(true);
    if (!load.success) return;
    expect(load.data.verdict).toBe('PASS');
  });

  test('aggregateOutcomes groups by model', async () => {
    const outcomes = [
      {
        id: '1',
        taskId: 'T1',
        source: 'review' as const,
        agent: 'reviewer',
        model: 'model-a',
        contractVersion: '0.4.3',
        timestamp: '2026-01-01T00:00:00Z',
        verdict: 'PASS' as const,
        weightedScore: 2.5,
        costUsd: 0.1,
        tokensIn: 1000,
        tokensOut: 500,
      },
      {
        id: '2',
        taskId: 'T2',
        source: 'review' as const,
        agent: 'reviewer',
        model: 'model-a',
        contractVersion: '0.4.3',
        timestamp: '2026-01-02T00:00:00Z',
        verdict: 'PASS' as const,
        weightedScore: 2.8,
        costUsd: 0.2,
        tokensIn: 2000,
        tokensOut: 1000,
      },
    ];
    const agg = aggregateOutcomes(outcomes);
    expect(agg.total).toBe(2);
    expect(agg.passRate).toBe(1);
    expect(agg.byModel['model-a'].count).toBe(2);
    expect(agg.byModel['model-a'].avgCost).toBeCloseTo(0.15);
  });
});
