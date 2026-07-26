import type { ScorecardCriterionInput, ScorecardRecordInput, ScorecardVerdictInput } from '../../validation/schemas';
import { SCORECARD_CRITERIA_DEF, type CriterionId } from './scorecard-constants';

export const PASS_THRESHOLD = 2.0;

/**
 * Create default criteria with score 2 (met by design) for manual completion.
 */
export function createDefaultCriteria(
  overrides: Partial<Record<CriterionId, { score: number; notes?: string; autoSuggested?: boolean }>> = {}
): ScorecardCriterionInput[] {
  return SCORECARD_CRITERIA_DEF.map((def) => {
    const o = overrides[def.id];
    return {
      id: def.id,
      label: def.label,
      weight: def.weight,
      score: o?.score ?? 2,
      notes: o?.notes,
      autoSuggested: o?.autoSuggested,
    };
  });
}

/**
 * Compute weighted score from criteria (0–3 scale per criterion).
 */
export function computeWeightedScore(criteria: ScorecardCriterionInput[]): number {
  let total = 0;
  for (const c of criteria) {
    total += c.score * c.weight;
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

  const acceptance = byId.get('acceptance') ?? 0;
  const minimalDiff = byId.get('minimal_diff') ?? 0;
  const regressions = byId.get('regressions') ?? 0;

  if (acceptance === 0 || minimalDiff === 0 || regressions === 0) {
    return 'REJECT';
  }
  if (weightedScore < 1.5) {
    return 'REJECT';
  }
  if (weightedScore >= PASS_THRESHOLD && !criteria.some((c) => c.score === 0)) {
    return 'PASS';
  }
  return 'REVISE';
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
