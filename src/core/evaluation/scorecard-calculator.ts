import type { ScorecardCriterionInput, ScorecardRecordInput, ScorecardVerdictInput } from '../../validation/schemas';
import { SCORECARD_CRITERIA_DEF, type CriterionId } from './scorecard-constants';

export const PASS_THRESHOLD = 2.0;

/**
 * Create default criteria with score 2 (met by design) for manual completion.
 */
export function createDefaultCriteria(
  overrides: Partial<Record<CriterionId, Pick<ScorecardCriterionInput, 'score' | 'notes' | 'autoSuggested' | 'unmeasured'>>> = {}
): ScorecardCriterionInput[] {
  return SCORECARD_CRITERIA_DEF.map((def) => {
    const o = overrides[def.id];
    return {
      id: def.id,
      label: def.label,
      weight: def.weight,
      score: o ? o.score : 2,
      notes: o?.notes,
      autoSuggested: o?.autoSuggested,
      unmeasured: o?.unmeasured,
    };
  });
}

/**
 * Compute weighted score from criteria (0–3 scale per criterion).
 */
export function computeWeightedScore(criteria: ScorecardCriterionInput[]): number {
  let total = 0;
  for (const c of criteria) {
    total += (c.score ?? 0) * c.weight;
  }
  return Math.round(total * 1000) / 1000;
}

/**
 * Determine verdict per docs/agent-scorecard.md rules.
 */
export function computeVerdict(
  criteria: ScorecardCriterionInput[],
  weightedScore: number
): ScorecardVerdictInput {
  const byId = new Map(criteria.map((c) => [c.id, c.score]));

  const acceptance = byId.has('acceptance') ? byId.get('acceptance') : 0;
  const minimalDiff = byId.has('minimal_diff') ? byId.get('minimal_diff') : 0;
  const regressions = byId.has('regressions') ? byId.get('regressions') : 0;

  if (acceptance === 0 || minimalDiff === 0 || regressions === 0) {
    return 'REJECT';
  }
  if (weightedScore < 1.5) {
    return 'REJECT';
  }
  if (pendingCriteria(criteria).length > 0) return 'REVISE';
  if (weightedScore >= PASS_THRESHOLD && !criteria.some((c) => c.score === 0)) {
    return 'PASS';
  }
  return 'REVISE';
}

/** Criteria whose measurement has not been supplied or resolved by a reviewer. */
export function pendingCriteria(criteria: ScorecardCriterionInput[]): CriterionId[] {
  return criteria.filter((c) => c.score === null ||
    (c.unmeasured && (c.autoSuggested !== false || !c.notes?.trim())))
    .map((c) => c.id);
}

/**
 * Build a complete scorecard record from criteria and metadata.
 */
export function buildScorecardRecord(
  params: {
    id: string;
    taskId: string;
    agent: string;
    contractVersion: string;
    criteria: ScorecardCriterionInput[];
    model?: string;
    evaluator?: string;
    findings?: string[];
    backlogId?: string;
    source?: ScorecardRecordInput['source'];
  }
): ScorecardRecordInput {
  const weightedScore = computeWeightedScore(params.criteria);
  const verdict = computeVerdict(params.criteria, weightedScore);
  return {
    id: params.id,
    taskId: params.taskId,
    agent: params.agent,
    model: params.model,
    contractVersion: params.contractVersion,
    evaluator: params.evaluator,
    criteria: params.criteria,
    weightedScore,
    verdict,
    findings: params.findings ?? [],
    createdAt: new Date().toISOString(),
    backlogId: params.backlogId,
    source: params.source,
  };
}
