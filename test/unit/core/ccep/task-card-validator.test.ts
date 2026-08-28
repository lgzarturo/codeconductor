import { describe, expect, test } from 'bun:test';
import { WORKFLOW_PROFILES } from '../../../../src/core/ccep/profiles';
import { validateTaskCardForProfile } from '../../../../src/core/ccep/task-card-validator';
import type { CanonicalTaskCardInput } from '../../../../src/validation/schemas';

function card(overrides: Partial<CanonicalTaskCardInput> = {}): CanonicalTaskCardInput {
  return {
    id: 'tc-1',
    title: 'Add loyalty benefits',
    objective: 'Ship CRUD for loyalty benefits',
    context: 'Hotel loyalty module',
    acceptanceCriteria: ['GET /benefits returns 200 with a list'],
    dependencies: [],
    constraints: [],
    risk: 'medium',
    targetFiles: ['src/benefits.ts'],
    agentType: 'implementer',
    evidenceRequired: ['tests_passed'],
    status: 'ready',
    type: 'feature',
    linkedCapabilities: [],
    boundaries: [],
    requiresTests: true,
    ...overrides,
  };
}

describe('validateTaskCardForProfile', () => {
  const feature = WORKFLOW_PROFILES.feature;

  test('a complete feature card has no issues', () => {
    expect(validateTaskCardForProfile(feature, card())).toEqual([]);
  });

  test('draft status is not routable', () => {
    const issues = validateTaskCardForProfile(feature, card({ status: 'draft' }));
    expect(issues.some((i) => i.code === 'NOT_ROUTABLE')).toBe(true);
  });

  test('high risk without requiresHumanReview is rejected', () => {
    const issues = validateTaskCardForProfile(
      feature,
      card({ risk: 'high', requiresHumanReview: false, requiresTests: true }),
    );
    expect(issues.some((i) => i.code === 'HIGH_RISK_REVIEW')).toBe(true);
  });

  test('non-docs types require tests', () => {
    const issues = validateTaskCardForProfile(feature, card({ requiresTests: false }));
    expect(issues.some((i) => i.code === 'TESTS_REQUIRED')).toBe(true);
  });

  test('fix profile requires actual/expected/reproduction fields', () => {
    const issues = validateTaskCardForProfile(WORKFLOW_PROFILES.fix, card({ type: 'fix' }));
    const missing = issues.filter((i) => i.code === 'MISSING_FIELD').map((i) => i.message);
    expect(missing.join(' ')).toContain('actualBehavior');
    expect(missing.join(' ')).toContain('expectedBehavior');
    expect(missing.join(' ')).toContain('reproductionSteps');
  });

  test('vague acceptance criteria are flagged', () => {
    const issues = validateTaskCardForProfile(
      feature,
      card({ acceptanceCriteria: ['improve UX'] }),
    );
    expect(issues.some((i) => i.code === 'VAGUE_ACCEPTANCE')).toBe(true);
  });
});
