import type { TaskCard } from '../pipeline/workflow-loop';
import type { BacklogItemInput, OpenspecTaskCardInput } from '../../validation/schemas';

/**
 * Map backlog item type to pipeline TaskCard type.
 */
function mapBacklogType(
  type: BacklogItemInput['type']
): TaskCard['type'] {
  switch (type) {
    case 'bug':
      return 'fix';
    case 'tech-debt':
      return 'refactor';
    case 'refactor':
      return 'refactor';
    default:
      return 'feature';
  }
}

/**
 * Infer risk from backlog priority.
 */
function inferRisk(priority: BacklogItemInput['priority']): TaskCard['risk'] {
  if (priority === 'P0') return 'high';
  if (priority === 'P1') return 'medium';
  return 'low';
}

/**
 * Convert an OpenSpec task card + backlog item to pipeline TaskCard shape.
 */
export function openspecTaskCardToPipelineTaskCard(
  card: OpenspecTaskCardInput,
  item: BacklogItemInput
): TaskCard {
  const scopeIn = item.scope
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    title: card.title,
    type: mapBacklogType(item.type),
    risk: inferRisk(item.priority),
    scope: {
      in: scopeIn.length > 0 ? scopeIn : [item.scope],
      out: item.outOfScope ? [item.outOfScope] : [],
    },
    context: `${item.description}\n\n${card.prompt}`,
    acceptanceCriteria: card.acceptanceCriteria,
    constraints: item.risks ? [item.risks] : [],
  };
}
