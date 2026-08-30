import { describe, expect, test } from 'bun:test';
import { applyAnalyzeSignals } from '../../src/core/evaluation/scorecard-signals';

describe('applyAnalyzeSignals', () => {
  test('acceptance is 0 when FR coverage is under 50%', () => {
    const hints = applyAnalyzeSignals({ criteriaOverrides: {}, findings: [] }, {
      frCoveragePct: 40,
      scCoveragePct: 100,
    });
    expect(hints.criteriaOverrides.acceptance?.score).toBe(0);
    expect(hints.criteriaOverrides.acceptance?.autoSuggested).toBe(true);
  });

  test('acceptance is 3 when FR and SC coverage are 100%', () => {
    const hints = applyAnalyzeSignals({ criteriaOverrides: {}, findings: [] }, {
      frCoveragePct: 100,
      scCoveragePct: 100,
    });
    expect(hints.criteriaOverrides.acceptance?.score).toBe(3);
  });

  test('tests is 0 when TDD is required without runner evidence', () => {
    const hints = applyAnalyzeSignals({ criteriaOverrides: {}, findings: [] }, {
      frCoveragePct: 100,
      scCoveragePct: 100,
      tddRequired: true,
      hasTddEvidence: false,
    });
    expect(hints.criteriaOverrides.tests?.score).toBe(0);
  });
});
