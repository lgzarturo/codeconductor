import type { TaskCard } from '../pipeline/workflow-loop';
import type { BacklogItemInput, OpenspecTaskCardInput } from '../../validation/schemas';
import { classifyRisk } from '../ccep/risk-classifier';

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
 * Convert an OpenSpec task card + backlog item to pipeline TaskCard shape.
 * Risk follows AGENTS.md signals, not backlog priority (P0 ≠ high).
 */
export function openspecTaskCardToPipelineTaskCard(
  card: OpenspecTaskCardInput,
  item: BacklogItemInput
): TaskCard {
  const scopeIn = item.scope
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const mappedType = mapBacklogType(item.type);
  return {
    title: card.title,
    type: mappedType,
    risk: classifyRisk({
      type: mappedType,
      targetFiles: scopeIn,
      signals: [item.type, item.scope, item.risks ?? '', item.description],
    }),
    scope: {
      in: scopeIn.length > 0 ? scopeIn : [item.scope],
      out: item.outOfScope ? [item.outOfScope] : [],
    },
    context: `${item.description}\n\n${card.prompt}`,
    acceptanceCriteria: card.acceptanceCriteria,
    constraints: item.risks ? [item.risks] : [],
  };
}
