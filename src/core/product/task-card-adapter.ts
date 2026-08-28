import type { CanonicalTaskCardInput } from '../../validation/schemas';
import type { TaskCard } from '../pipeline/workflow-loop';

export function canonicalToPipelineTaskCard(card: CanonicalTaskCardInput): TaskCard {
  return {
    title: card.title,
    type: card.type,
    risk: card.risk,
    scope: {
      in: card.targetFiles,
      out: card.boundaries,
    },
    context: card.context,
    acceptanceCriteria: card.acceptanceCriteria,
    constraints: card.constraints,
    id: card.id,
    objective: card.objective,
    status: card.status,
    agentType: card.agentType,
    evidenceRequired: card.evidenceRequired,
    dependencies: card.dependencies,
    linkedCapabilities: card.linkedCapabilities,
    requiresHumanReview: card.requiresHumanReview,
    requiresTests: card.requiresTests,
    contextScope: card.contextScope,
    actualBehavior: card.actualBehavior,
    expectedBehavior: card.expectedBehavior,
    reproductionSteps: card.reproductionSteps,
  };
}

export function pipelineToCanonicalTaskCard(
  card: TaskCard,
  id: string,
  objective: string,
): CanonicalTaskCardInput {
  return {
    id: card.id ?? id,
    title: card.title,
    objective: card.objective ?? objective,
    context: card.context,
    acceptanceCriteria: card.acceptanceCriteria,
    dependencies: card.dependencies ?? [],
    constraints: card.constraints,
    risk: card.risk,
    targetFiles: card.scope.in,
    agentType: card.agentType ?? 'implementer',
    evidenceRequired: card.evidenceRequired ?? ['acceptance_criteria_met'],
    status: card.status ?? 'ready',
    type: card.type,
    linkedCapabilities: card.linkedCapabilities ?? [],
    boundaries: card.scope.out,
    requiresHumanReview: card.requiresHumanReview,
    requiresTests: card.requiresTests,
    contextScope: card.contextScope,
    actualBehavior: card.actualBehavior,
    expectedBehavior: card.expectedBehavior,
    reproductionSteps: card.reproductionSteps,
  };
}
