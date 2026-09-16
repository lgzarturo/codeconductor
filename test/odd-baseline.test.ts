import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectDeliveryRoute } from '../src/core/ccep/delivery-route';
import { scorecardCommand } from '../src/commands/scorecard.command';
import { aggregateOutcomes } from '../src/core/evaluation/outcome-store';
import { validateTaskOutcome } from '../src/validation/schemas';

describe('ODD baseline', () => {
  test('separates write authorization and coordination from the unchanged risk', () => {
    expect(selectDeliveryRoute({ authorized: false, coordination: 'small', risk: 'high' })).toEqual({
      route: 'read-only',
      risk: 'high',
    });

    expect(selectDeliveryRoute({ authorized: true, coordination: 'small', risk: 'high' })).toEqual({
      route: 'small',
      risk: 'high',
    });

    expect(selectDeliveryRoute({ authorized: true, coordination: 'tracked', risk: 'medium' })).toEqual({
      route: 'tracked',
      risk: 'medium',
    });

    expect(selectDeliveryRoute({
      authorized: true,
      coordination: 'small',
      risk: 'low',
      openspecRequested: true,
    })).toEqual({ route: 'openspec', risk: 'low' });
  });

  test('accepts explicit delivery telemetry, including unknown token usage', () => {
    const outcome = validateTaskOutcome({
      id: 'odd-unknown',
      taskId: 'BC-020',
      source: 'openspec',
      agent: 'tester',
      model: 'unknown',
      contractVersion: '1.4.1',
      timestamp: '2026-09-16T00:00:00Z',
      delivery: {
        route: 'tracked',
        contextBytes: 2048,
        handoffs: 2,
        checks: ['bun test'],
        tokenUsage: { status: 'unknown' },
      },
    });

    expect(outcome.delivery).toEqual({
      route: 'tracked',
      contextBytes: 2048,
      handoffs: 2,
      checks: ['bun test'],
      tokenUsage: { status: 'unknown' },
    });
  });

  test('does not turn unknown token usage into a zero-token average', () => {
    const base = {
      source: 'openspec' as const,
      agent: 'implementer',
      model: 'model-a',
      contractVersion: '1.4.1',
    };
    const aggregate = aggregateOutcomes([
      {
        ...base,
        id: 'known',
        taskId: 'small-change',
        timestamp: '2026-09-16T00:00:00Z',
        delivery: {
          route: 'small',
          tokenUsage: { status: 'known', total: 150 },
        },
      },
      {
        ...base,
        id: 'unknown',
        taskId: 'tracked-change',
        timestamp: '2026-09-16T00:01:00Z',
        delivery: {
          route: 'tracked',
          tokenUsage: { status: 'unknown' },
        },
      },
    ]);

    expect(aggregate.byModel['model-a'].avgTokens).toBe(150);
    expect(aggregate.byModel['model-a'].knownTokenMeasurements).toBe(1);
  });

  test('scorecard record persists the baseline telemetry', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'cc-odd-baseline-'));
    try {
      const result = await scorecardCommand({
        subcommand: 'record',
        projectRoot,
        output: 'json',
        taskId: 'BC-020',
        deliveryRoute: 'openspec',
        contextBytes: 4096,
        handoffs: 3,
        checks: ['bun test', 'bun run typecheck'],
      });
      expect(result.code).toBe(0);
      const outcome = (result.data as { outcome: { delivery: unknown } }).outcome;
      expect(outcome.delivery).toEqual({
        route: 'openspec',
        contextBytes: 4096,
        handoffs: 3,
        checks: ['bun test', 'bun run typecheck'],
        tokenUsage: { status: 'unknown' },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
