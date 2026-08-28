export type RiskLevel = 'low' | 'medium' | 'high';

export interface ClassifyRiskInput {
  readonly type?: string;
  readonly targetFiles?: readonly string[];
  readonly signals?: readonly string[];
}

const HIGH_RE =
  /(migrat|schema|auth(?:n|z|entication|orization)?|oauth|payment|billing|credential|password|secret|openapi|public[-_ ]?api|api[-_ ]?contract)/i;

/**
 * Classify delivery risk from AGENTS.md signals.
 * Migration, public API/contracts, and auth/payment paths are high
 * independent of backlog priority (P0 does not imply high).
 */
export function classifyRisk(input: ClassifyRiskInput): RiskLevel {
  const type = (input.type ?? '').toLowerCase();
  const blob = [type, ...(input.targetFiles ?? []), ...(input.signals ?? [])].join(' ');

  if (HIGH_RE.test(blob) || type === 'db-migration' || type === 'api-contract') {
    return 'high';
  }
  if (type === 'docs' || type === 'review') {
    return 'low';
  }
  if (type === 'test') {
    return 'low';
  }
  if (type === 'refactor' && (input.signals ?? []).some((s) => /full[-_ ]?test[-_ ]?coverage/i.test(s))) {
    return 'low';
  }
  if (type === 'fix') {
    const isolated = (input.signals ?? []).some((s) => /isolated/i.test(s));
    return isolated ? 'low' : 'medium';
  }
  return 'medium';
}
