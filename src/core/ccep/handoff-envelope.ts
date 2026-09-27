import {
  HandoffEnvelopeSchema,
  type DeliveryLedgerInput,
  type HandoffEnvelopeInput,
} from '../../validation/schemas';

/**
 * Build a stable handoff from durable delivery artifacts and current workspace
 * divergence. The result deliberately omits task context, agent conversation,
 * tool output, and the ledger body.
 */
export function buildHandoffEnvelope(
  ledger: DeliveryLedgerInput,
  changedPaths: readonly string[],
): HandoffEnvelopeInput {
  return HandoffEnvelopeSchema.parse({
    version: 1,
    task: {
      id: ledger.taskCard.id,
      objective: ledger.taskCard.objective,
      acceptanceCriteria: ledger.taskCard.acceptanceCriteria,
      status: ledger.taskCard.status,
    },
    decisions: {
      constraints: ledger.taskCard.constraints,
      unresolved: ledger.tasks
        .filter((task) => task.status === 'blocked')
        .map((task) => task.title),
    },
    scope: {
      relevantFiles: ledger.taskCard.targetFiles,
      boundaries: ledger.taskCard.boundaries,
    },
    verification: { evidence: ledger.evidence },
    change: { touchedFiles: [...new Set(changedPaths)].sort() },
    next: {
      role: ledger.taskCard.agentType,
      objective: ledger.nextStep,
    },
    sources: {
      deliveryLedger: ledger.id,
      memoryTopicKey: ledger.memoryTopicKey,
      technicalPlanPath: ledger.technicalPlanPath,
    },
  });
}
