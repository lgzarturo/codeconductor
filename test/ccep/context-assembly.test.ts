import { describe, expect, test } from 'bun:test';
import { assembleContext, resumeDecision } from '../../src/core/ccep/context-assembly';
import { DeliveryTelemetrySchema } from '../../src/validation/schemas';

describe('ccep context assembly', () => {
  test('orders sources deterministically and respects the byte budget', () => {
    const result = assembleContext([
      { source: 'memory', content: 'memory' },
      { source: 'scope', content: 'scope' },
      { source: 'ledger', content: 'ledger' },
      { source: 'evidence', content: 'evidence' },
    ], 17);
    expect(result.fragments.map((fragment) => fragment.source)).toEqual(['ledger', 'scope', 'memory']);
    expect(result.contextBytes).toBe(17);
    expect(result.omittedSources).toEqual(['evidence']);
  });

  test('keeps compaction as a summary fragment and asks only on workspace divergence', () => {
    const result = assembleContext([{ source: 'compaction', content: 'RED/GREEN passed; evidence ev-1' }], 100);
    expect(result.fragments[0]?.content).not.toContain('transcript');
    expect(resumeDecision([])).toEqual({ status: 'ready' });
    expect(resumeDecision(['src/a.ts'])).toEqual({
      status: 'needs_decision',
      changedPaths: ['src/a.ts'],
      question: 'Workspace changed in src/a.ts. Continue with the current workspace?',
    });
  });

  test('preserves unavailable provider telemetry as unknown rather than zero', () => {
    expect(DeliveryTelemetrySchema.parse({
      route: 'tracked',
      contextBytes: 20,
      tokenUsage: { status: 'unknown' },
    }).tokenUsage).toEqual({ status: 'unknown' });
  });
});
