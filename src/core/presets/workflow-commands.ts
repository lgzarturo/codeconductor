/** CCEP slash workflows that share Step 0. Keep in sync with WorkflowCommandSchema. */
export const WORKFLOW_COMMANDS = [
  'feature',
  'fix',
  'refactor',
  'review',
  'test-plan',
  'tdd-cycle',
  'spec-mutation',
  'api-contract',
  'db-migration',
  'pagespeed',
  'openspec',
  'backlog',
  'scorecard',
  'council',
  'iterative',
  'explore',
  'triage',
  'prototype',
  'handoff',
  'clarify',
  'security',
  'odd',
] as const;

export type WorkflowCommandName = (typeof WORKFLOW_COMMANDS)[number];

/** Delivery workflows that must run openspec validate/analyze before implementer. */
export const SDD_DELIVERY_COMMANDS = new Set<WorkflowCommandName>([
  'feature',
  'fix',
  'tdd-cycle',
  'spec-mutation',
  'db-migration',
  'openspec',
  'iterative',
  'api-contract',
]);

export const SDD_GATE_HEADING = '## Step 0b — OpenSpec quality gates';
