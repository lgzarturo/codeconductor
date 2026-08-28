import { describe, expect, test } from 'bun:test';
import { classifyRisk } from '../../../../src/core/ccep/risk-classifier';
import {
  canonicalToPipelineTaskCard,
  pipelineToCanonicalTaskCard,
} from '../../../../src/core/product/task-card-adapter';
import { openspecTaskCardToPipelineTaskCard } from '../../../../src/core/openspec/task-card-adapter';
import type { CanonicalTaskCardInput } from '../../../../src/validation/schemas';
import type { BacklogItemInput, OpenspecTaskCardInput } from '../../../../src/validation/schemas';

function fullCard(): CanonicalTaskCardInput {
  return {
    id: 'auth-impl',
    title: 'Implement auth',
    objective: 'Add login',
    context: 'No auth yet',
    acceptanceCriteria: ['login works with a valid password'],
    dependencies: ['auth-api'],
    constraints: ['no new deps'],
    risk: 'high',
    targetFiles: ['src/auth/login.ts'],
    agentType: 'implementer',
    evidenceRequired: ['tests_passed'],
    status: 'ready',
    type: 'feature',
    linkedCapabilities: ['cap-auth'],
    boundaries: ['src/payments'],
    requiresHumanReview: true,
    requiresTests: true,
    contextScope: 'isolated',
    actualBehavior: undefined,
    expectedBehavior: undefined,
    reproductionSteps: undefined,
  };
}

describe('canonical ↔ pipeline TaskCard round-trip', () => {
  test('preserves id, status, boundaries, and routing fields', () => {
    const canonical = fullCard();
    const pipeline = canonicalToPipelineTaskCard(canonical);
    expect(pipeline.scope.out).toEqual(['src/payments']);
    expect(pipeline.id).toBe('auth-impl');
    expect(pipeline.status).toBe('ready');
    expect(pipeline.agentType).toBe('implementer');

    const back = pipelineToCanonicalTaskCard(pipeline, 'ignored-id', 'ignored-objective');
    expect(back).toEqual(canonical);
  });
});

describe('classifyRisk', () => {
  test('database migration paths are high regardless of type', () => {
    expect(classifyRisk({ type: 'feature', targetFiles: ['src/db/migrations/001.sql'] })).toBe('high');
  });

  test('auth and payment signals are high', () => {
    expect(classifyRisk({ type: 'fix', targetFiles: ['src/auth/oauth.ts'] })).toBe('high');
    expect(classifyRisk({ type: 'feature', signals: ['payment webhook'] })).toBe('high');
  });

  test('P0-equivalent files without auth/api/migration stay medium', () => {
    expect(classifyRisk({ type: 'feature', targetFiles: ['src/loyalty.ts'], signals: ['P0'] })).toBe(
      'medium',
    );
  });

  test('docs and review are low', () => {
    expect(classifyRisk({ type: 'docs', targetFiles: ['README.md'] })).toBe('low');
  });
});

describe('openspec adapter does not map P0 to high', () => {
  test('a P0 feature with a non-sensitive scope is medium', () => {
    const item: BacklogItemInput = {
      id: 'BC-001',
      title: 'Loyalty list',
      priority: 'P0',
      status: 'READY',
      type: 'feature',
      dependencies: [],
      description: 'List loyalty benefits',
      scope: 'src/loyalty.ts',
      outOfScope: '',
      acceptanceCriteria: ['list returns 200'],
      progress: 0,
    };
    const card: OpenspecTaskCardInput = {
      id: 'BC-001-implement',
      backlogId: 'BC-001',
      phase: 'implement',
      title: 'Implement',
      prompt: 'do it',
      agent: 'implementer',
      dependsOn: [],
      acceptanceCriteria: item.acceptanceCriteria,
      status: 'pending',
    };
    const pipeline = openspecTaskCardToPipelineTaskCard(card, item);
    expect(pipeline.risk).toBe('medium');
  });
});
