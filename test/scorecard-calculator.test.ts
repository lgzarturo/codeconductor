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
import { SCORECARD_CRITERIA_DEF } from '../src/core/evaluation/scorecard-constants';

describe('scorecard-calculator', () => {
  test('scorecard criteria weights sum exactly to 1.0 (100%)', () => {
    const totalWeight = SCORECARD_CRITERIA_DEF.reduce((sum, c) => sum + c.weight, 0);
    expect(Math.round(totalWeight * 1000) / 1000).toBe(1.0);
  });

  test('maximum possible score is 3.0 when all criteria score 3', () => {
    const criteria = SCORECARD_CRITERIA_DEF.map((def) => ({
      id: def.id,
      label: def.label,
      weight: def.weight,
      score: 3,
    }));
    expect(computeWeightedScore(criteria)).toBe(3.0);
  });

  test('baseline score is exactly 2.0 when all criteria score 2', () => {
    const criteria = createDefaultCriteria();
    expect(computeWeightedScore(criteria)).toBe(PASS_THRESHOLD);
  });

  test('acceptance=0 triggers REJECT even if other criteria score 3', () => {
    const criteria = SCORECARD_CRITERIA_DEF.map((def) => ({
      id: def.id,
      label: def.label,
      weight: def.weight,
      score: def.id === 'acceptance' ? 0 : 3,
    }));
    const weighted = computeWeightedScore(criteria);
    expect(weighted).toBe(2.1); // 3 * (1.0 - 0.3) = 2.10 >= PASS_THRESHOLD
    expect(computeVerdict(criteria, weighted)).toBe('REJECT');
  });
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
