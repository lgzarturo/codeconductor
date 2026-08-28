import { describe, expect, test } from 'bun:test';
import {
  CanonicalTaskCardSchema,
  DecisionSchema,
  EvidenceSchema,
  KnowledgeEntitySchema,
  ProductGraphSchema,
  ProductEventSchema,
  validateProductGraph,
} from '../src/validation/schemas';

describe('Product OS schemas', () => {
  test('KnowledgeEntitySchema validates', () => {
    const entity = KnowledgeEntitySchema.parse({
      type: 'decision',
      id: 'decision:adr-011',
      name: 'Product OS',
      source: 'docs/adr/adr-011.md',
      confidence: 'high',
      relations: [],
    });
    expect(entity.id).toBe('decision:adr-011');
  });

  test('DecisionSchema validates', () => {
    const d = DecisionSchema.parse({
      id: 'adr-011',
      context: 'Need product memory',
      alternatives: ['vector only'],
      chosenOption: 'typed graph',
      rationale: 'traceability',
      consequences: ['more files'],
      date: '2026-07-26',
    });
    expect(d.chosenOption).toBe('typed graph');
  });

  test('EvidenceSchema validates', () => {
    const e = EvidenceSchema.parse({
      id: 'ev-1',
      source: 'cc verify',
      type: 'verification',
      timestamp: '2026-07-26T12:00:00.000Z',
      confidence: 0.9,
    });
    expect(e.type).toBe('verification');
  });

  test('CanonicalTaskCardSchema validates', () => {
    const card = CanonicalTaskCardSchema.parse({
      id: 'auth-impl',
      title: 'Implement auth',
      objective: 'Add login',
      context: 'No auth yet',
      acceptanceCriteria: ['login works'],
      dependencies: ['auth-api'],
      constraints: [],
      risk: 'high',
      targetFiles: ['src/auth'],
      agentType: 'implementer',
      evidenceRequired: ['tests_passed'],
      status: 'ready',
      type: 'feature',
      requiresHumanReview: true,
      requiresTests: true,
    });
    expect(card.agentType).toBe('implementer');
  });

  test('ProductGraphSchema validates', () => {
    const graph = validateProductGraph({
      version: 1,
      productId: 'product:codeconductor',
      productName: 'CodeConductor',
      nodes: [
        { id: 'product:codeconductor', type: 'product', name: 'CodeConductor', data: {} },
      ],
      edges: [],
      updatedAt: '2026-07-26T12:00:00.000Z',
    });
    expect(graph.nodes.length).toBe(1);
  });

  test('ProductEventSchema validates', () => {
    const event = ProductEventSchema.parse({
      id: 'evt-1',
      type: 'ingest.completed',
      timestamp: '2026-07-26T12:00:00.000Z',
      payload: { nodes: 5 },
    });
    expect(event.type).toBe('ingest.completed');
  });
});
