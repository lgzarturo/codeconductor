import type { ExecutionContextInput, PlannerOutputInput } from '../../validation/schemas';

export interface GateDecision {
  readonly stop: boolean;
  readonly reason?:
    | 'clarification'
    | 'confirmation'
    | 'high_risk'
    | 'risk_threshold';
  readonly message?: string;
}

function matchesRiskThreshold(
  severity: 'low' | 'medium' | 'high',
  threshold: 'low' | 'medium' | 'high',
): boolean {
  const order = { low: 0, medium: 1, high: 2 };
  return order[severity] >= order[threshold];
}

export function evaluateConfirmationGate(
  context: ExecutionContextInput,
  planner: PlannerOutputInput,
): GateDecision {
  const gate = context.profile.confirmationGate;

  if (gate.stopOnQuestions && planner.questionsForUser.length > 0) {
    return {
      stop: true,
      reason: 'clarification',
      message: planner.questionsForUser.join('; '),
    };
  }

  if (planner.needsConfirmation) {
    return { stop: true, reason: 'confirmation' };
  }

  if (gate.stopOnHighRisk) {
    const hasHigh = planner.risks.some((r) => r.severity === 'high');
    if (hasHigh) {
      return { stop: true, reason: 'high_risk' };
    }
  }

  const threshold = context.envelope.constraints.riskThreshold;
  const exceedsThreshold = planner.risks.some((r) => matchesRiskThreshold(r.severity, threshold));
  if (exceedsThreshold && threshold === 'low') {
    return { stop: true, reason: 'risk_threshold' };
  }

  return { stop: false };
}
