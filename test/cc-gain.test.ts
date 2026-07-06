import { describe, expect, test } from 'bun:test';
import { computeCcGain, ccGainToScorecardImpact } from '../src/core/complexity/cc-gain.ts';
import type { ComplexityAuditReport } from '../src/core/complexity/types.ts';

function makeReport(overrides: Partial<ComplexityAuditReport> = {}): ComplexityAuditReport {
  return {
    locAdded: 0,
    locRemoved: 0,
    locDelta: 0,
    depsAdded: [],
    depsRemoved: [],
    depsDelta: 0,
    cyclomaticAdded: 0,
    cyclomaticRemoved: 0,
    cyclomaticDelta: 0,
    findings: [],
    ...overrides,
  };
}

describe('computeCcGain', () => {
  test('returns neutral verdict for empty report', () => {
    const result = computeCcGain(makeReport());
    expect(result.verdict).toBe('neutral');
    expect(result.raw).toBe(0);
    expect(result.normalized).toBe(0);
  });

  test('positive verdict when significant code removed', () => {
    const result = computeCcGain(
      makeReport({
        locRemoved: 50,
        locAdded: 10,
        locDelta: -40,
      }),
    );
    expect(result.verdict).toBe('positive');
    expect(result.raw).toBeGreaterThan(0);
    expect(result.breakdown.locContribution).toBe(50 * 0.4);
  });

  test('positive verdict when dependencies avoided', () => {
    const result = computeCcGain(
      makeReport({
        depsRemoved: [
          { name: 'lodash', type: 'import' },
          { name: 'moment', type: 'import' },
        ],
        depsAdded: [],
        depsDelta: -2,
      }),
    );
    expect(result.verdict).toBe('positive');
    expect(result.breakdown.depContribution).toBe(2 * 1.5);
  });

  test('negative verdict when complexity increases', () => {
    const result = computeCcGain(
      makeReport({
        locAdded: 30,
        cyclomaticAdded: 15,
        cyclomaticRemoved: 0,
      }),
    );
    expect(result.verdict).toBe('negative');
    expect(result.breakdown.complexityContribution).toBeLessThan(0);
  });

  test('abstraction findings reduce the score', () => {
    const base = computeCcGain(
      makeReport({
        locRemoved: 20,
        locAdded: 0,
      }),
    );

    const withAbstraction = computeCcGain(
      makeReport({
        locRemoved: 20,
        locAdded: 0,
        findings: [
          {
            severity: 'info',
            pattern: 'trivial-wrapper',
            file: 'a.ts',
            message: 'wrapper',
            action: 'delete',
          },
          {
            severity: 'warning',
            pattern: 'excessive-abstraction',
            file: 'b.ts',
            message: 'abstraction',
            action: 'delete',
          },
        ],
      }),
    );

    expect(withAbstraction.raw).toBeLessThan(base.raw);
    expect(withAbstraction.breakdown.abstractionPenalty).toBe(2);
  });

  test('normalized is clamped to [-1, 1]', () => {
    const extreme = computeCcGain(
      makeReport({
        locRemoved: 1000,
        depsRemoved: [
          { name: 'a', type: 'import' },
          { name: 'b', type: 'import' },
          { name: 'c', type: 'import' },
        ],
        cyclomaticRemoved: 100,
      }),
    );
    expect(extreme.normalized).toBeLessThanOrEqual(1);
    expect(extreme.normalized).toBeGreaterThanOrEqual(-1);
  });

  test('balanced additions and removals yield near-neutral', () => {
    const result = computeCcGain(
      makeReport({
        locAdded: 10,
        locRemoved: 10,
        locDelta: 0,
        cyclomaticAdded: 5,
        cyclomaticRemoved: 5,
        cyclomaticDelta: 0,
      }),
    );
    // locRemoved still contributes positively (10 * 0.4 = 4)
    // cyclomatic removed contributes (5 * 2.0 = 10), added subtracts (5 * 2.0 = 10)
    // net raw = 4, normalized = 4/50 = 0.08 → positive
    expect(result.raw).toBeCloseTo(4, 5);
    expect(result.normalized).toBeCloseTo(0.08, 2);
  });

  // ── Normalization edge cases ───────────────────────────────────────────────

  test('very large positive raw is clamped to normalized = 1', () => {
    const result = computeCcGain(
      makeReport({
        locRemoved: 10_000,
        depsRemoved: Array.from({ length: 100 }, (_, i) => ({
          name: `pkg-${i}`,
          type: 'import' as const,
        })),
        cyclomaticRemoved: 10_000,
      }),
    );
    expect(result.normalized).toBe(1);
    expect(result.normalized).toBeLessThanOrEqual(1);
  });

  test('very large negative raw is clamped to normalized = -1', () => {
    const result = computeCcGain(
      makeReport({
        locAdded: 10_000,
        cyclomaticAdded: 10_000,
        depsAdded: Array.from({ length: 100 }, (_, i) => ({
          name: `pkg-${i}`,
          type: 'import' as const,
        })),
      }),
    );
    expect(result.normalized).toBe(-1);
    expect(result.normalized).toBeGreaterThanOrEqual(-1);
    expect(result.verdict).toBe('negative');
  });

  test('raw can exceed 1.0 even when normalized is clamped', () => {
    const result = computeCcGain(
      makeReport({
        locRemoved: 1_000,
        depsRemoved: Array.from({ length: 50 }, (_, i) => ({
          name: `pkg-${i}`,
          type: 'import' as const,
        })),
        cyclomaticRemoved: 1_000,
      }),
    );
    expect(result.raw).toBeGreaterThan(1);
    expect(result.normalized).toBe(1);
  });

  test('verdict is neutral when raw is between -0.05 and 0.05 normalized', () => {
    // To get a normalized between -0.05 and 0.05, raw must be between -2.5 and 2.5
    // (raw / 50). Use a small loc contribution: locRemoved = 5 → raw = 2
    const result = computeCcGain(
      makeReport({
        locRemoved: 5,
      }),
    );
    expect(result.raw).toBeCloseTo(2, 5);
    expect(result.normalized).toBeCloseTo(0.04, 2);
    expect(result.verdict).toBe('neutral');
  });

  test('verdict is positive just above 0.05 threshold', () => {
    // raw = 3 → normalized = 0.06 → positive
    const result = computeCcGain(
      makeReport({
        locRemoved: 8, // 8 * 0.4 = 3.2 → 0.064 → positive
      }),
    );
    expect(result.normalized).toBeGreaterThan(0.05);
    expect(result.verdict).toBe('positive');
  });

  test('verdict is negative just below -0.05 threshold', () => {
    // raw = -3 → normalized = -0.06 → negative
    // Get raw = -3 by adding cyclomaticAdded = 2 (2 * 2.0 = -4)... actually
    // raw = 0 + 0 - 4 = -4, normalized = -0.08 → negative
    const result = computeCcGain(
      makeReport({
        cyclomaticAdded: 2,
      }),
    );
    expect(result.normalized).toBeLessThan(-0.05);
    expect(result.verdict).toBe('negative');
  });

  // ── Dependency contribution edge cases ─────────────────────────────────────

  test('negative deps delta (more deps added than removed) reduces gain', () => {
    const result = computeCcGain(
      makeReport({
        depsAdded: [
          { name: 'a', type: 'import' },
          { name: 'b', type: 'import' },
        ],
        depsRemoved: [],
        depsDelta: 2,
      }),
    );
    expect(result.breakdown.depContribution).toBe(-3); // -(2 * 1.5)
  });

  test('zero deps contribution when added equals removed', () => {
    const result = computeCcGain(
      makeReport({
        depsAdded: [{ name: 'a', type: 'import' }],
        depsRemoved: [{ name: 'a', type: 'import' }],
        depsDelta: 0,
      }),
    );
    expect(result.breakdown.depContribution).toBe(0);
  });

  // ── Abstraction penalty edge cases ────────────────────────────────────────

  test('penalizes all 4 abstraction patterns', () => {
    const result = computeCcGain(
      makeReport({
        findings: [
          { severity: 'warning', pattern: 'trivial-wrapper', file: 'a.ts', message: '', action: 'delete' },
          { severity: 'warning', pattern: 'one-method-class', file: 'b.ts', message: '', action: 'delete' },
          { severity: 'warning', pattern: 'excessive-abstraction', file: 'c.ts', message: '', action: 'delete' },
          { severity: 'warning', pattern: 'single-implementation-interface', file: 'd.ts', message: '', action: 'delete' },
        ],
      }),
    );
    expect(result.breakdown.abstractionPenalty).toBe(4);
  });

  test('does NOT penalize non-abstraction findings', () => {
    const result = computeCcGain(
      makeReport({
        findings: [
          { severity: 'info', pattern: 'unused-import', file: 'a.ts', message: '', action: 'delete' },
          { severity: 'warning', pattern: 'external-dep-for-native', file: 'b.ts', message: '', action: 'replace-native' },
          { severity: 'info', pattern: 'dead-code', file: 'c.ts', message: '', action: 'delete' },
        ],
      }),
    );
    // None of these are in the abstraction penalty set
    expect(result.breakdown.abstractionPenalty).toBe(0);
  });

  test('only counts abstraction findings, not severity-based', () => {
    // Even with critical severity, unused-import doesn't add to the penalty
    const result = computeCcGain(
      makeReport({
        findings: [
          { severity: 'critical', pattern: 'unused-import', file: 'a.ts', message: '', action: 'delete' },
        ],
      }),
    );
    expect(result.breakdown.abstractionPenalty).toBe(0);
  });

  test('abstraction penalty can flip a positive verdict to neutral', () => {
    // raw contribution from LOC: 20 * 0.4 = 8
    // raw contribution from penalty: 4 abstractions * 1.0 = 4
    // net raw = 8 - 4 = 4, normalized = 0.08 → still positive
    // Try with more abstractions: 10 * 1.0 = 10, net raw = 8 - 10 = -2
    const result = computeCcGain(
      makeReport({
        locRemoved: 20,
        findings: Array.from({ length: 10 }, (_, i) => ({
          severity: 'warning' as const,
          pattern: 'trivial-wrapper' as const,
          file: `a${i}.ts`,
          message: '',
          action: 'delete' as const,
        })),
      }),
    );
    // raw = 8 - 10 = -2, normalized = -0.04 → neutral
    expect(result.raw).toBeCloseTo(-2, 5);
    expect(result.normalized).toBeCloseTo(-0.04, 2);
    expect(result.verdict).toBe('neutral');
  });

  // ── Combined contribution scenarios ───────────────────────────────────────

  test('all positive contributions sum linearly into raw', () => {
    const result = computeCcGain(
      makeReport({
        locRemoved: 10, // +4
        depsRemoved: [{ name: 'x', type: 'import' }], // depsAvoided = 1, +1.5
        cyclomaticRemoved: 5, // +10
      }),
    );
    // raw = 4 + 1.5 + 10 = 15.5
    expect(result.raw).toBeCloseTo(15.5, 5);
    expect(result.breakdown.locContribution).toBe(4);
    expect(result.breakdown.depContribution).toBe(1.5);
    expect(result.breakdown.complexityContribution).toBe(10);
  });

  test('breakdown fields are always present and numeric', () => {
    const result = computeCcGain(makeReport());
    expect(typeof result.breakdown.locContribution).toBe('number');
    expect(typeof result.breakdown.depContribution).toBe('number');
    expect(typeof result.breakdown.complexityContribution).toBe('number');
    expect(typeof result.breakdown.abstractionPenalty).toBe('number');
  });

  test('result shape is always valid for any input', () => {
    const result = computeCcGain(
      makeReport({
        locAdded: 1000,
        locRemoved: 1000,
        depsAdded: [{ name: 'a', type: 'import' }],
        depsRemoved: [{ name: 'b', type: 'import' }],
        cyclomaticAdded: 100,
        cyclomaticRemoved: 100,
        findings: [
          { severity: 'info', pattern: 'unused-import', file: 'x.ts', message: '', action: 'delete' },
        ],
      }),
    );
    expect(['positive', 'neutral', 'negative']).toContain(result.verdict);
    expect(result.normalized).toBeGreaterThanOrEqual(-1);
    expect(result.normalized).toBeLessThanOrEqual(1);
  });
});

describe('ccGainToScorecardImpact', () => {
  test('returns 0 for negative verdict', () => {
    const impact = ccGainToScorecardImpact({
      raw: -10,
      normalized: -0.2,
      verdict: 'negative',
      breakdown: { locContribution: 0, depContribution: 0, complexityContribution: -10, abstractionPenalty: 0 },
    });
    expect(impact).toBe(0);
  });

  test('returns 1 for neutral verdict', () => {
    const impact = ccGainToScorecardImpact({
      raw: 0,
      normalized: 0,
      verdict: 'neutral',
      breakdown: { locContribution: 0, depContribution: 0, complexityContribution: 0, abstractionPenalty: 0 },
    });
    expect(impact).toBe(1);
  });

  test('returns 2 for positive verdict with raw < 10', () => {
    const impact = ccGainToScorecardImpact({
      raw: 5,
      normalized: 0.1,
      verdict: 'positive',
      breakdown: { locContribution: 5, depContribution: 0, complexityContribution: 0, abstractionPenalty: 0 },
    });
    expect(impact).toBe(2);
  });

  test('returns 3 for positive verdict with raw >= 10', () => {
    const impact = ccGainToScorecardImpact({
      raw: 15,
      normalized: 0.3,
      verdict: 'positive',
      breakdown: { locContribution: 15, depContribution: 0, complexityContribution: 0, abstractionPenalty: 0 },
    });
    expect(impact).toBe(3);
  });
});
