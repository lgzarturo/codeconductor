import { describe, expect, test } from 'bun:test';
import { evaluateConfirmationGate } from '../../src/core/ccep/confirmation-gate';
import { loadWorkflowProfile } from '../../src/core/ccep/workflow-profile-loader';
import type { ExecutionContextInput, PlannerOutputInput } from '../../src/validation/schemas';

function baseContext(command: 'feature' | 'fix' | 'review'): ExecutionContextInput {
  const profile = loadWorkflowProfile(command);
  return {
    envelope: {
      protocolVersion: 'ccep-1',
      command,
      userRequest: 'test request',
      projectId: 'app',
      repoContext: { stack: [], existingModules: [] },
      constraints: {
        outputFormat: command === 'review' ? 'verdict' : 'taskcard',
        needConfirmation: true,
        riskThreshold: 'medium',
      },
      executionPolicy: { modelMode: 'structured', maxVariance: 'low' },
    },
    profile,
    intent: { type: command, goal: 'test' },
    project: { name: 'app', rootDir: '/tmp' },
    knowledge: {},
    ast: { source: 'detect', confidence: 'low' },
    policies: {
      architecture: 'modular',
      testing: 'required',
      documentation: 'required',
      breakingChanges: 'approval',
    },
    outputSchema: 'planner-output',
  };
}

function basePlanner(overrides: Partial<PlannerOutputInput> = {}): PlannerOutputInput {
  return {
    status: 'success',
    confidence: 0.9,
    goal: 'Test goal',
    assumptions: [],
    risks: [],
    tasks: [],
    questionsForUser: [],
    needsConfirmation: false,
    ...overrides,
  };
}

describe('ccep confirmation-gate', () => {
  test('stops when planner returns questions for user', () => {
    const decision = evaluateConfirmationGate(
      baseContext('feature'),
      basePlanner({ questionsForUser: ['Are benefits global or per-plan?'] }),
    );

    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('clarification');
  });

  test('stops when planner sets needsConfirmation', () => {
    const decision = evaluateConfirmationGate(
      baseContext('feature'),
      basePlanner({ needsConfirmation: true }),
    );

    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('confirmation');
  });

  test('stops on high severity risk when profile requires it', () => {
    const decision = evaluateConfirmationGate(
      baseContext('feature'),
      basePlanner({
        risks: [{ type: 'security', description: 'Auth path touched', severity: 'high' }],
      }),
    );

    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('high_risk');
  });

  test('fix profile respects medium risk threshold from envelope', () => {
    const ctx = baseContext('fix');
    ctx.envelope.constraints.riskThreshold = 'low';

    const decision = evaluateConfirmationGate(
      ctx,
      basePlanner({
        risks: [{ type: 'regression', description: 'Shared module', severity: 'medium' }],
      }),
    );

    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('risk_threshold');
  });

  test('allows proceed when no gate conditions match', () => {
    const decision = evaluateConfirmationGate(baseContext('fix'), basePlanner());

    expect(decision.stop).toBe(false);
  });
});
