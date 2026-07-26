/**
 * Tests for scorecard calculator.
 */
import { describe, expect, test } from 'bun:test';
import {
  buildScorecardRecord,
  computeVerdict,
  computeWeightedScore,
  createDefaultCriteria,
  PASS_THRESHOLD,
} from '../src/core/evaluation/scorecard-calculator';

describe('scorecard-calculator', () => {
  test('computeWeightedScore applies weights', () => {
    const criteria = createDefaultCriteria({ acceptance: { score: 3 } });
    const score = computeWeightedScore(criteria);
    expect(score).toBeGreaterThan(1.5);
    expect(score).toBeLessThanOrEqual(3);
  });

  test('PASS when all criteria met and score >= threshold', () => {
    const criteria = createDefaultCriteria();
    const weighted = computeWeightedScore(criteria);
    expect(weighted).toBeGreaterThanOrEqual(PASS_THRESHOLD);
    expect(computeVerdict(criteria, weighted)).toBe('PASS');
  });

  test('REJECT when acceptance is 0', () => {
    const criteria = createDefaultCriteria({ acceptance: { score: 0 } });
    const weighted = computeWeightedScore(criteria);
    expect(computeVerdict(criteria, weighted)).toBe('REJECT');
  });

  test('REJECT when minimal_diff is 0', () => {
    const criteria = createDefaultCriteria({ minimal_diff: { score: 0 } });
    expect(computeVerdict(criteria, computeWeightedScore(criteria))).toBe('REJECT');
  });

  test('REJECT when regressions is 0', () => {
    const criteria = createDefaultCriteria({ regressions: { score: 0 } });
    expect(computeVerdict(criteria, computeWeightedScore(criteria))).toBe('REJECT');
  });

  test('REVISE when score below pass but above reject threshold', () => {
    const criteria = createDefaultCriteria({
      acceptance: { score: 1 },
      minimal_diff: { score: 2 },
      tests: { score: 1 },
      regressions: { score: 2 },
    });
    const weighted = computeWeightedScore(criteria);
    expect(weighted).toBeLessThan(PASS_THRESHOLD);
    expect(weighted).toBeGreaterThanOrEqual(1.5);
    expect(computeVerdict(criteria, weighted)).toBe('REVISE');
  });

  test('buildScorecardRecord produces valid record', () => {
    const criteria = createDefaultCriteria();
    const record = buildScorecardRecord({
      id: 'sc-test-1',
      taskId: 'BC-001',
      agent: 'reviewer',
      contractVersion: '0.4.3',
      criteria,
      model: 'test-model',
    });
    expect(record.id).toBe('sc-test-1');
    expect(record.verdict).toBe('PASS');
    expect(record.criteria.length).toBe(8);
  });
});
