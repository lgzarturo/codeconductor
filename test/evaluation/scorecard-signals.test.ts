import { describe, expect, test } from 'bun:test';
import {
  collectScorecardSignals,
  criteriaFromSignals,
} from '../../src/core/evaluation/scorecard-signals';

describe('collectScorecardSignals extra signals', () => {
  test('extra scopeViolationCount sets minimal_diff to 0 and records finding', () => {
    const hints = collectScorecardSignals(process.cwd(), undefined, {
      scopeViolationCount: 3,
    });
    expect(hints.criteriaOverrides.minimal_diff?.score).toBe(0);
    expect(hints.criteriaOverrides.minimal_diff?.notes).toContain('3 scope violations');
    expect(hints.findings).toContain('Scope violation: 3 files outside scope.');
    expect(hints.scopeViolationCount).toBe(3);

    const criteria = criteriaFromSignals(hints);
    const minDiff = criteria.find((c) => c.id === 'minimal_diff');
    expect(minDiff?.score).toBe(0);
  });

  test('extra hashMismatch sets tests to 0 and records finding', () => {
    const hints = collectScorecardSignals(process.cwd(), undefined, {
      hashMismatch: true,
    });
    expect(hints.criteriaOverrides.tests?.score).toBe(0);
    expect(hints.criteriaOverrides.tests?.notes).toContain('Test tampering detected');
    expect(hints.findings).toContain('Test tampering detected via test-freeze hash mismatch.');
    expect(hints.hashMismatch).toBe(true);

    const criteria = criteriaFromSignals(hints);
    const testsCrit = criteria.find((c) => c.id === 'tests');
    expect(testsCrit?.score).toBe(0);
  });
});
