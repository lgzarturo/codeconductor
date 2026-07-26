import type { CanonicalTaskCardInput } from '../../validation/schemas';
import type { TaskCard } from '../pipeline/workflow-loop';

export function canonicalToPipelineTaskCard(card: CanonicalTaskCardInput): TaskCard {
  return {
    title: card.title,
    type: card.type ?? 'feature',
    risk: card.risk,
    scope: {
      in: card.targetFiles,
      out: [],
    },
    context: card.context,
    acceptanceCriteria: card.acceptanceCriteria,
    constraints: card.constraints,
  };
}

export function pipelineToCanonicalTaskCard(
  card: TaskCard,
  id: string,
  objective: string,
): CanonicalTaskCardInput {
  return {
    id,
    title: card.title,
    objective,
    context: card.context,
    acceptanceCriteria: card.acceptanceCriteria,
    dependencies: [],
    constraints: card.constraints,
    risk: card.risk,
    targetFiles: card.scope.in,
    agentType: 'implementer',
    evidenceRequired: ['acceptance_criteria_met'],
    status: 'ready',
    type: card.type,
    linkedCapabilities: [],
  };
}
