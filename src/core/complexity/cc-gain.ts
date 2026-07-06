import type { CcGainResult, ComplexityAuditReport } from './types.ts';

/**
 * Compute cc-gain from an audit report.
 *
 * Formula:
 *   gain = (locRemoved * 0.4) + (depsAvoided * 1.5) + (complexityReduced * 2.0) - (abstractionFindings * 1.0)
 *
 * - `depsAvoided` = depsRemoved.length - depsAdded.length (positive = good)
 * - `complexityReduced` = cyclomaticRemoved - cyclomaticAdded (positive = good)
 * - `abstractionFindings` = count of findings with pattern matching abstraction-related bloat
 *
 * Normalized to [-1.0, +1.0].
 */
export function computeCcGain(report: ComplexityAuditReport): CcGainResult {
  const locContribution = report.locRemoved * 0.4;

  const depsAvoided = report.depsRemoved.length - report.depsAdded.length;
  const depContribution = depsAvoided * 1.5;

  const complexityReduced = report.cyclomaticRemoved - report.cyclomaticAdded;
  const complexityContribution = complexityReduced * 2.0;

  const abstractionFindings = report.findings.filter(
    (f) =>
      f.pattern === 'excessive-abstraction' ||
      f.pattern === 'single-implementation-interface' ||
      f.pattern === 'one-method-class' ||
      f.pattern === 'trivial-wrapper',
  ).length;
  const abstractionPenalty = abstractionFindings * 1.0;

  const raw =
    locContribution + depContribution + complexityContribution - abstractionPenalty;

  // Normalize: assume max practical value is ~100 (e.g., 50 LOC removed * 0.4 = 20)
  // Practical ceiling: ~50 LOC removed × 0.4 = 20 as max raw contribution
  const MAX_RAW = 50;
  const normalized = Math.max(-1, Math.min(1, raw / MAX_RAW));

  const verdict: CcGainResult['verdict'] =
    normalized > 0.05 ? 'positive' : normalized < -0.05 ? 'negative' : 'neutral';

  return {
    raw,
    normalized,
    verdict,
    breakdown: {
      locContribution,
      depContribution,
      complexityContribution,
      abstractionPenalty,
    },
  };
}

/**
 * Map a cc-gain result to a scorecard impact score (0–3).
 *
 * - negative verdict → 0
 * - neutral verdict  → 1
 * - positive, raw < 10 → 2
 * - positive, raw >= 10 → 3
 */
export function ccGainToScorecardImpact(result: CcGainResult): number {
  if (result.verdict === 'negative') return 0;
  if (result.verdict === 'neutral') return 1;
  if (result.raw >= 10) return 3;
  return 2;
}
