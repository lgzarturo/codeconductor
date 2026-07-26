import type { OpenspecTaskCardPhaseInput } from '../../validation/schemas';

export interface PhaseAgentRoute {
  agent: string;
  modelKey: string;
}

const PHASE_ROUTES: Record<OpenspecTaskCardPhaseInput, PhaseAgentRoute> = {
  discover: { agent: 'repo-explorer', modelKey: 'repo-explorer' },
  design: { agent: 'architect', modelKey: 'architect' },
  implement: { agent: 'implementer', modelKey: 'implementer' },
  test: { agent: 'tester', modelKey: 'tester' },
  review: { agent: 'reviewer', modelKey: 'reviewer' },
};

/**
 * Map workflow phase to conductor agent role.
 */
export function routePhaseToAgent(phase: OpenspecTaskCardPhaseInput): PhaseAgentRoute {
  return PHASE_ROUTES[phase];
}

/**
 * Extended route with resolved model (when available).
 */
export interface PhaseAgentRouteResolved extends PhaseAgentRoute {
  model?: string;
  subagentDelegate?: boolean;
}
