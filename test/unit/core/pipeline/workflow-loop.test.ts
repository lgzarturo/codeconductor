import { describe, expect, test } from 'bun:test';
import {
  runWorkflowPipeline,
  type PipelineCallbacks,
  type TaskCard,
  type TechnicalPlan,
} from '../../../../src/core/pipeline/workflow-loop';
import type { CouncilVerdictInput } from '../../../../src/domain/council/council-consensus';

const CARD: TaskCard = {
  title: 'Add endpoint',
  type: 'feature',
  risk: 'medium',
  scope: { in: ['api'], out: ['auth'] },
  context: 'ctx',
  acceptanceCriteria: ['returns 200'],
  constraints: [],
};

const PLAN: TechnicalPlan = {
  approach: 'add controller',
  filesAffected: ['a.ts'],
  edgeCaseMatrix: [{ scenario: 'empty', expected: '400' }],
};

const approvingVerdicts: CouncilVerdictInput[] = [
  { agentId: 'a1', agentRole: 'architect', status: 'APPROVED', securityVeto: false, confidence: 1, findings: [], summary: 'ok' },
  { agentId: 'a2', agentRole: 'security', status: 'APPROVED', securityVeto: false, confidence: 1, findings: [], summary: 'ok' },
];

function makeCallbacks(overrides: Partial<PipelineCallbacks> = {}): PipelineCallbacks {
  return {
    runIntake: async () => CARD,
    runStructure: async (c) => c,
    runDesign: async () => PLAN,
    runTest: async () => ({ testsWritten: 3, suiteFails: true }),
    runImplement: async () => ({ codeWritten: true, testsPass: true }),
    runValidate: async () => ({ mutationScore: 90, diffAuditPassed: true, survivingMutants: [] }),
    runCouncilReview: async () => approvingVerdicts,
    runCompact: async () => {},
    onStopGate: async () => 'APPROVE',
    ...overrides,
  };
}

const run = (overrides?: Partial<PipelineCallbacks>) =>
  runWorkflowPipeline('do the thing', { callbacks: makeCallbacks(overrides) });

describe('core/pipeline/workflow-loop', () => {
  test('happy path: runs all 8 phases to DONE with an approved verdict', async () => {
    const result = await run();
    expect(result.success).toBe(true);
    expect(result.phase).toBe('DONE');
    expect(result.verdict?.status).toBe('APPROVED');
    expect(result.technicalPlan).toEqual(PLAN);
  });

  test('unanimous council escalates when a configured agent is missing', async () => {
    const result = await runWorkflowPipeline('do the thing', {
      callbacks: makeCallbacks({
        runCouncilReview: async () => [approvingVerdicts[0]!],
      }),
      councilConfig: {
        algorithm: 'unanimous',
        allowSecurityVeto: true,
        allowComplianceVeto: true,
        expectedAgentIds: ['a1', 'a2'],
      },
    });

    expect(result.success).toBe(false);
    expect(result.phase).toBe('COUNCIL');
    expect(result.verdict?.status).toBe('ESCALATED');
    expect(result.verdict?.summary).toMatch(/missing/i);
  });

  test('INTAKE failure short-circuits the pipeline', async () => {
    const result = await run({ runIntake: async () => { throw new Error('intake boom'); } });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('INTAKE');
    expect(result.error).toContain('intake boom');
  });

  test('STOP Gate 1 (after Design) rejects and halts at DESIGN', async () => {
    const result = await run({ onStopGate: async (phase) => (phase === 3 ? 'REJECT' : 'APPROVE') });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('DESIGN');
    expect(result.error).toContain('STOP Gate at Phase 3');
    expect(result.technicalPlan).toEqual(PLAN);
  });

  test('TDD Red violation: a passing suite before implementation fails at TEST', async () => {
    const result = await run({ runTest: async () => ({ testsWritten: 2, suiteFails: false }) });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('TEST');
    expect(result.error).toContain('TDD Red Phase');
  });

  test('IMPLEMENT retries up to 3 times then fails if the suite never passes', async () => {
    let calls = 0;
    const result = await run({
      runImplement: async () => {
        calls++;
        return { codeWritten: true, testsPass: false };
      },
    });
    expect(calls).toBe(3);
    expect(result.success).toBe(false);
    expect(result.phase).toBe('IMPLEMENT');
    expect(result.error).toContain('3 iterations');
  });

  test('IMPLEMENT succeeds when a later iteration turns green', async () => {
    let calls = 0;
    const result = await run({
      runImplement: async () => {
        calls++;
        return { codeWritten: true, testsPass: calls >= 2 };
      },
    });
    expect(calls).toBe(2);
    expect(result.success).toBe(true);
    expect(result.phase).toBe('DONE');
  });

  test('VALIDATE fails below the 80% mutation threshold', async () => {
    const result = await run({
      runValidate: async () => ({ mutationScore: 50, diffAuditPassed: true, survivingMutants: ['m1'] }),
    });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('VALIDATE');
    expect(result.error).toContain('Mutation test failed');
  });

  test('VALIDATE fails when the diff scope audit fails', async () => {
    const result = await run({
      runValidate: async () => ({ mutationScore: 95, diffAuditPassed: false, survivingMutants: [] }),
    });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('VALIDATE');
    expect(result.error).toContain('Diff scope audit failed');
  });

  test('COUNCIL rejection (security veto) halts at COUNCIL', async () => {
    const result = await run({
      runCouncilReview: async () => [
        { agentId: 's', agentRole: 'security', status: 'REJECTED', securityVeto: true, confidence: 1, findings: [], summary: 'veto' },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('COUNCIL');
    expect(result.error).toContain('Council rejected');
    expect(result.verdict?.status).toBe('REJECTED');
  });

  test('COUNCIL escalation (low confidence) halts at COUNCIL', async () => {
    const result = await run({
      runCouncilReview: async () => [
        { agentId: 'a', agentRole: 'architect', status: 'APPROVED', securityVeto: false, confidence: 0.4, findings: [], summary: 'unsure' },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('COUNCIL');
    expect(result.error).toContain('Council escalated');
    expect(result.verdict?.status).toBe('ESCALATED');
  });

  test('STOP Gate 2 (after Council) escalation halts at COUNCIL', async () => {
    const result = await run({ onStopGate: async (phase) => (phase === 7 ? 'ESCALATE' : 'APPROVE') });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('COUNCIL');
    expect(result.error).toContain('STOP Gate at Phase 7');
    expect(result.verdict?.status).toBe('APPROVED');
  });

  test('COMPACT failure is reported with the verdict preserved', async () => {
    const result = await run({ runCompact: async () => { throw new Error('compact boom'); } });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('COMPACT');
    expect(result.error).toContain('compact boom');
    expect(result.verdict?.status).toBe('APPROVED');
  });

  test('a tiny wall-clock budget trips the timeout guardrail', async () => {
    const result = await runWorkflowPipeline('slow', {
      maxWallClockSeconds: 0.001,
      callbacks: makeCallbacks({
        runIntake: async () => {
          await new Promise((r) => setTimeout(r, 20));
          return CARD;
        },
      }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout guardrail');
  });
});
