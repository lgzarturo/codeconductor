/**
 * Tests for outcome store.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withQueueLock } from '../src/core/queue/lock';
import { ok } from '../src/utils/result';
import {
  appendOutcome,
  listOutcomes,
  saveScorecard,
  loadScorecard,
  aggregateOutcomes,
  generateEvalId,
  hasPassingScorecard,
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

  test('recognizes a human PASS outcome as a passing review gate', async () => {
    await appendOutcome(TEST_DIR, {
      id: 'human-review-1',
      taskId: 'BC-024',
      source: 'review',
      agent: 'reviewer',
      model: 'human',
      contractVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      verdict: 'PASS',
      backlogId: 'BC-024',
    });
    expect(await hasPassingScorecard(TEST_DIR, 'BC-024')).toBe(true);
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

  test('optional averages divide only by outcomes that report each metric', () => {
    const base = {
      source: 'review' as const,
      agent: 'reviewer',
      model: 'model-a',
      contractVersion: '0.5.0',
      verdict: 'PASS' as const,
    };
    const agg = aggregateOutcomes([
      {
        ...base,
        id: 'metric-1',
        taskId: 'T1',
        timestamp: '2026-01-01T00:00:00Z',
        weightedScore: 3,
        costUsd: 0.3,
        tokensIn: 100,
        tokensOut: 50,
      },
      {
        ...base,
        id: 'metric-2',
        taskId: 'T2',
        timestamp: '2026-01-02T00:00:00Z',
      },
      {
        ...base,
        id: 'metric-3',
        taskId: 'T3',
        timestamp: '2026-01-03T00:00:00Z',
        weightedScore: 1,
        tokensIn: 200,
      },
    ]);

    expect(agg.byAgent.reviewer.count).toBe(3);
    expect(agg.byAgent.reviewer.avgScore).toBe(2);
    expect(agg.byModel['model-a'].avgScore).toBe(2);
    expect(agg.byModel['model-a'].avgCost).toBe(0.3);
    expect(agg.byModel['model-a'].avgTokens).toBe(175);
  });

  test('reported zero token counts still participate in the denominator', () => {
    const agg = aggregateOutcomes([
      {
        id: 'tok-0',
        taskId: 'T1',
        source: 'review',
        agent: 'reviewer',
        model: 'model-a',
        contractVersion: '0.5.0',
        timestamp: '2026-01-01T00:00:00Z',
        verdict: 'PASS',
        tokensIn: 0,
        tokensOut: 0,
      },
      {
        id: 'tok-100',
        taskId: 'T2',
        source: 'review',
        agent: 'reviewer',
        model: 'model-a',
        contractVersion: '0.5.0',
        timestamp: '2026-01-02T00:00:00Z',
        verdict: 'PASS',
        tokensIn: 100,
        tokensOut: 0,
      },
    ]);

    expect(agg.byModel['model-a'].avgTokens).toBe(50);
  });

  test('listOutcomes filters by experiment and variant', async () => {
    await appendOutcome(TEST_DIR, {
      id: 'exp-1',
      taskId: 'T1',
      source: 'manual',
      agent: 'reviewer',
      model: 'model-a',
      contractVersion: '1.0.0',
      timestamp: '2026-08-28T00:00:00Z',
      experimentId: 'abl-1',
      variantId: 'minus:review',
      suiteTaskId: 'fix-add-off-by-one',
    });
    await appendOutcome(TEST_DIR, {
      id: 'exp-2',
      taskId: 'T2',
      source: 'manual',
      agent: 'reviewer',
      model: 'model-a',
      contractVersion: '1.0.0',
      timestamp: '2026-08-28T00:00:01Z',
      experimentId: 'abl-1',
      variantId: 'baseline',
    });
    const listed = await listOutcomes(TEST_DIR, { experimentId: 'abl-1', variantId: 'minus:review' });
    expect(listed.success).toBe(true);
    if (!listed.success) return;
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.id).toBe('exp-1');
  });

  test('aggregateOutcomes groups by variant', () => {
    const agg = aggregateOutcomes([
      {
        id: '1',
        taskId: 'T1',
        source: 'manual',
        agent: 'reviewer',
        model: 'model-a',
        contractVersion: '1.0.0',
        timestamp: '2026-08-28T00:00:00Z',
        variantId: 'baseline',
        weightedScore: 2.4,
        verdict: 'PASS',
      },
      {
        id: '2',
        taskId: 'T2',
        source: 'manual',
        agent: 'reviewer',
        model: 'model-a',
        contractVersion: '1.0.0',
        timestamp: '2026-08-28T00:00:01Z',
        variantId: 'minus:review',
        weightedScore: 2.0,
        verdict: 'REVISE',
      },
    ]);
    expect(agg.byVariant.baseline.count).toBe(1);
    expect(agg.byVariant.baseline.avgScore).toBe(2.4);
    expect(agg.byVariant['minus:review'].avgScore).toBe(2.0);
  });
});

describe('outcome-store locked writes', () => {
  let dir: string;

  function makeOutcome(id: string) {
    return {
      id,
      taskId: 'BC-LOCK',
      source: 'manual' as const,
      agent: 'reviewer',
      model: 'test-model',
      contractVersion: '0.0.0-test',
      timestamp: new Date().toISOString(),
      verdict: 'PASS' as const,
    };
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cc-lock-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('appendOutcome waits for the held queue lock', async () => {
    const holder = withQueueLock(dir, async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return ok(undefined);
    });
    // Let the holder acquire first, then time only the append.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const start = Date.now();
    const written = await appendOutcome(dir, makeOutcome('out-locked'));
    const elapsed = Date.now() - start;
    const held = await holder;
    expect(held.success).toBe(true);
    expect(written.success).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(250);
  });

  test('concurrent appends keep every line valid', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => appendOutcome(dir, makeOutcome(`out-${i}`))),
    );
    expect(results.every((r) => r.success)).toBe(true);
    const raw = await readFile(join(dir, '.codeconductor', 'telemetry', 'outcomes.jsonl'), 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(20);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const listed = await listOutcomes(dir, { taskId: 'BC-LOCK' });
    expect(listed.success && listed.data).toHaveLength(20);
  });
});
