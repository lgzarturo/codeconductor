/**
 * Aggregation + pricing table tests (M1).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  aggregateByRun,
  aggregateBySpecialist,
  aggregateByTask,
  totalTokens,
} from '../../src/core/telemetry/aggregate';
import {
  clearPricingCache,
  estimateCostFromTable,
  isPricingStale,
  loadPricingTable,
  pickCost,
  PRICING_TABLE_PATH,
} from '../../src/core/telemetry/pricing';
import {
  createBaseEvent,
  HARNESS_TELEMETRY_SCHEMA_PATH,
  type HarnessTelemetryEvent,
} from '../../src/core/telemetry/schema';

afterEach(() => {
  clearPricingCache();
});

function call(partial: Partial<HarnessTelemetryEvent> & { runId: string; event: HarnessTelemetryEvent['event'] }): HarnessTelemetryEvent {
  const base = createBaseEvent({ runId: partial.runId, event: partial.event });
  return { ...base, ...partial, schema: 'harness-telemetry/v1', runId: partial.runId, event: partial.event };
}

describe('aggregate', () => {
  test('sums model.call by specialist and rolls up task/run', () => {
    const events: HarnessTelemetryEvent[] = [
      call({
        runId: 'r1',
        event: 'model.call',
        taskId: 'T1',
        agent: { role: 'implementer', agentId: 'a1' },
        usage: {
          input: 100,
          output: 20,
          cacheRead: 50,
          cacheWrite: 10,
          reasoning: null,
          calls: null,
          apiRetries: null,
        },
        cost: { usd: 0.01, basis: 'host-estimate', pricingVersion: null, isRealSpend: false },
      }),
      call({
        runId: 'r1',
        event: 'model.call',
        taskId: 'T1',
        agent: { role: 'implementer', agentId: 'a1' },
        usage: {
          input: 40,
          output: 10,
          cacheRead: null,
          cacheWrite: null,
          reasoning: null,
          calls: null,
          apiRetries: null,
        },
        cost: { usd: 0.002, basis: 'host-estimate', pricingVersion: null, isRealSpend: false },
      }),
      call({
        runId: 'r1',
        event: 'agent.end',
        taskId: 'T1',
        agent: { role: 'implementer', agentId: 'a1' },
      }),
      call({
        runId: 'r1',
        event: 'retry',
        taskId: 'T1',
        loop: { iteration: 1, retryReason: 'fail', maxIterations: 3 },
      }),
      call({
        runId: 'r1',
        event: 'iteration',
        taskId: 'T1',
        loop: { iteration: 2, retryReason: null, maxIterations: 3 },
      }),
      call({
        runId: 'r1',
        event: 'verification',
        taskId: 'T1',
        verification: { gate: 'tests', passed: true, durationMs: 100 },
      }),
      call({
        runId: 'r1',
        event: 'task.end',
        taskId: 'T1',
        usage: {
          input: 140,
          output: 30,
          cacheRead: 50,
          cacheWrite: 10,
          reasoning: null,
          calls: null,
          apiRetries: null,
        },
        cost: { usd: 0.012, basis: 'host-estimate', pricingVersion: null, isRealSpend: false },
        loop: { iteration: 2, retryReason: null, maxIterations: 3 },
      }),
      call({
        runId: 'r1',
        event: 'run.end',
        usage: {
          input: 140,
          output: 30,
          cacheRead: 50,
          cacheWrite: 10,
          reasoning: null,
          calls: null,
          apiRetries: null,
        },
        cost: { usd: 0.012, basis: 'host-estimate', pricingVersion: null, isRealSpend: false },
        durationMs: 5000,
      }),
    ];

    const specialists = aggregateBySpecialist(events);
    expect(specialists.length).toBe(1);
    expect(specialists[0].role).toBe('implementer');
    expect(specialists[0].usage.input).toBe(140);
    expect(specialists[0].usage.cacheRead).toBe(50);
    expect(specialists[0].modelCalls).toBe(2);
    expect(specialists[0].agentEnds).toBe(1);

    const tasks = aggregateByTask(events);
    expect(tasks[0].retries).toBe(1);
    expect(tasks[0].iterations).toBe(2);
    expect(tasks[0].verifications.tests.passed).toBe(1);
    expect(tasks[0].usage.input).toBe(140);

    const runs = aggregateByRun(events);
    expect(runs[0].costUsd).toBe(0.012);
    expect(runs[0].durationMs).toBe(5000);
    expect(totalTokens(runs[0].usage)).toBe(140 + 50 + 10 + 30);
  });
});

describe('pricing', () => {
  test('loads verified Anthropic rates and estimates cost', async () => {
    const table = await loadPricingTable();
    expect(table.version).toBe('pricing/v1');
    expect(isPricingStale(table, new Date('2026-10-19T12:00:00Z'))).toBe(false);

    const opus = table.entries.find((e) => e.modelId === 'claude-opus-5-5');
    expect(opus).toBeDefined();
    expect(opus!.input).toBe(4);
    expect(opus!.output).toBe(20);
    expect(opus!.cacheRead).toBe(0.2);
    expect(opus!.sourceUrl).toContain('platform.claude.com');

    const est = await estimateCostFromTable({
      modelId: 'claude-sonnet-5-5',
      usage: {
        input: 1_000_000,
        output: 1_000_000,
        cacheRead: 1_000_000,
        cacheWrite: 1_000_000,
        reasoning: null,
        calls: null,
        apiRetries: null,
      },
      table,
    });
    // 2 + 10 + 0.1 + 2.5 = 14.6
    expect(est.usd).toBeCloseTo(14.6, 5);
    expect(est.basis).toBe('pricing-table');
    expect(est.isRealSpend).toBe(false);
  });

  test('unknown model → usd null basis none (not 0)', async () => {
    const est = await estimateCostFromTable({
      modelId: 'totally-unknown-model',
      usage: {
        input: 100,
        output: 50,
        cacheRead: null,
        cacheWrite: null,
        reasoning: null,
        calls: null,
        apiRetries: null,
      },
    });
    expect(est.usd).toBeNull();
    expect(est.basis).toBe('none');
    expect(est.usd).not.toBe(0);
  });

  test('pickCost prefers provider-billed over host-estimate', () => {
    const picked = pickCost([
      { usd: 1.0, basis: 'host-estimate', pricingVersion: null, isRealSpend: false },
      { usd: 0.8, basis: 'provider-billed', pricingVersion: null, isRealSpend: true },
    ]);
    expect(picked.basis).toBe('provider-billed');
    expect(picked.usd).toBe(0.8);
    expect(picked.isRealSpend).toBe(true);
  });

  test('pricing file path is under package root', () => {
    expect(PRICING_TABLE_PATH.endsWith('pricing/pricing.v1.json')).toBe(true);
  });
});

describe('schema artifact', () => {
  test('schemas/harness-telemetry.v1.json is stable JSON Schema 2020-12', async () => {
    const raw = await readFile(HARNESS_TELEMETRY_SCHEMA_PATH, 'utf-8');
    const schema = JSON.parse(raw) as {
      $schema: string;
      $id: string;
      required: string[];
    };
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('harness-telemetry/v1');
    expect(schema.required).toEqual(['schema', 'ts', 'harness', 'runId', 'event']);
    const hash = createHash('sha256').update(raw).digest('hex');
    expect(hash.length).toBe(64);
  });
});
