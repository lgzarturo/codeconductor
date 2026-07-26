/**
 * Product OS entity taxonomy — pure types for the product AST.
 * Persisted forms are validated via Zod schemas in validation/schemas.ts.
 */

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type ProductNodeType =
  | 'product'
  | 'domain'
  | 'capability'
  | 'requirement'
  | 'decision'
  | 'component'
  | 'flow'
  | 'contract'
  | 'metric'
  | 'risk'
  | 'task'
  | 'evidence';

export type GraphRelation =
  | 'implements'
  | 'depends_on'
  | 'documents'
  | 'affects'
  | 'evidences'
  | 'blocks'
  | 'contains';

export type MemoryLayer = 'operational' | 'semantic' | 'episodic' | 'procedural' | 'strategic';

export type ProductEventType =
  | 'task.started'
  | 'task.completed'
  | 'decision.recorded'
  | 'evidence.added'
  | 'ingest.completed'
  | 'goal.updated'
  | 'blocker.detected'
  | 'verification.completed'
  | 'feedback.processed';

export const PRODUCT_NODE_TYPES: readonly ProductNodeType[] = [
  'product',
  'domain',
  'capability',
  'requirement',
  'decision',
  'component',
  'flow',
  'contract',
  'metric',
  'risk',
  'task',
  'evidence',
];

export const GRAPH_RELATIONS: readonly GraphRelation[] = [
  'implements',
  'depends_on',
  'documents',
  'affects',
  'evidences',
  'blocks',
  'contains',
];
