import { describe, expect, it } from 'bun:test';

import { runWorkflowPipeline } from '../src/core/pipeline/workflow-loop';
import type { TaskCard, TechnicalPlan, ValidationReport, PipelineCallbacks } from '../src/core/pipeline/workflow-loop';
import { councilConsensus } from '../src/domain/council/council-consensus';
import type { CouncilVerdictInput } from '../src/domain/council/council-consensus';

// Mock templates
const mockTaskCard: TaskCard = {
  title: 'Implement feature X',
  type: 'feature',
  risk: 'medium',
  scope: { in: ['src/x.ts'], out: [] },
  context: 'Some context',
  acceptanceCriteria: ['AC1'],
  constraints: [],
};

const mockPlan: TechnicalPlan = {
  approach: 'Approach description',
  filesAffected: ['src/x.ts'],
  edgeCaseMatrix: [{ scenario: 'empty input', expected: 'throws' }],
};

const mockValidationReport: ValidationReport = {
  mutationScore: 85,
  diffAuditPassed: true,
  survivingMutants: [],
};

const mockVerdicts: CouncilVerdictInput[] = [
  {
    agentId: 'architect',
    agentRole: 'Architect',
    status: 'APPROVED',
    securityVeto: false,
    confidence: 0.9,
    findings: [],
    summary: 'Architect approved.',
  },
  {
    agentId: 'security',
    agentRole: 'Security',
    status: 'APPROVED',
    securityVeto: false,
    confidence: 0.8,
    findings: [],
    summary: 'Security approved.',
  },
];

const defaultCallbacks = (): PipelineCallbacks => ({
  runIntake: async () => mockTaskCard,
  runStructure: async (card) => card,
  runDesign: async () => mockPlan,
  runTest: async () => ({ testsWritten: 1, suiteFails: true }),
  runImplement: async () => ({ codeWritten: true, testsPass: true }),
  runValidate: async () => mockValidationReport,
  runCouncilReview: async () => mockVerdicts,
  runCompact: async () => {},
  onStopGate: async () => 'APPROVE',
});

describe('Workflow Loop Core Pipeline & Guardrails', () => {
  it('runs successfully end-to-end (Phases 1-8)', async () => {
    const result = await runWorkflowPipeline('Please implement feature X', {
      callbacks: defaultCallbacks(),
    });

    expect(result.success).toBe(true);
    expect(result.phase).toBe('DONE');
    expect(result.taskCard).toBeDefined();
    expect(result.technicalPlan).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(result.verdict?.status).toBe('APPROVED');
  });

  it('pauses and continues at STOP Gate Phase 3 (Design) when approved', async () => {
    let gateCalled = false;
    const callbacks = defaultCallbacks();
    callbacks.onStopGate = async (phase, plan) => {
      if (phase === 3) {
        gateCalled = true;
        expect(plan).toEqual(mockPlan);
        return 'APPROVE';
      }
      return 'APPROVE';
    };

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(gateCalled).toBe(true);
    expect(result.success).toBe(true);
  });

  it('aborts at STOP Gate Phase 3 (Design) when rejected', async () => {
    const callbacks = defaultCallbacks();
    callbacks.onStopGate = async (phase) => {
      if (phase === 3) return 'REJECT';
      return 'APPROVE';
    };

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('DESIGN');
    expect(result.error).toContain('rejected with status: REJECT');
  });

  it('pauses and continues at STOP Gate Phase 7 (Council) when approved', async () => {
    let gateCalled = false;
    const callbacks = defaultCallbacks();
    callbacks.onStopGate = async (phase, verdict) => {
      if (phase === 7) {
        gateCalled = true;
        expect(verdict.status).toBe('APPROVED');
        return 'APPROVE';
      }
      return 'APPROVE';
    };

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(gateCalled).toBe(true);
    expect(result.success).toBe(true);
  });

  it('aborts at STOP Gate Phase 7 (Council) when escalated', async () => {
    const callbacks = defaultCallbacks();
    callbacks.onStopGate = async (phase) => {
      if (phase === 7) return 'ESCALATE';
      return 'APPROVE';
    };

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('COUNCIL');
    expect(result.error).toContain('rejected with status: ESCALATE');
  });

  it('violates TDD RED phase when written tests do not fail', async () => {
    const callbacks = defaultCallbacks();
    callbacks.runTest = async () => ({ testsWritten: 1, suiteFails: false }); // Suite passed!

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('TEST');
    expect(result.error).toContain('TDD Red Phase violation');
  });

  it('retries during TDD GREEN loop up to 3 times', async () => {
    let implCount = 0;
    const callbacks = defaultCallbacks();
    callbacks.runImplement = async () => {
      implCount++;
      if (implCount < 3) {
        return { codeWritten: true, testsPass: false }; // fail first 2 times
      }
      return { codeWritten: true, testsPass: true }; // pass on 3rd try
    };

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(implCount).toBe(3);
    expect(result.success).toBe(true);
  });

  it('aborts loop and escalates if tests still fail after 3 iterations', async () => {
    let implCount = 0;
    const callbacks = defaultCallbacks();
    callbacks.runImplement = async () => {
      implCount++;
      return { codeWritten: true, testsPass: false }; // always fail
    };

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(implCount).toBe(3);
    expect(result.success).toBe(false);
    expect(result.phase).toBe('IMPLEMENT');
    expect(result.error).toContain('TDD Green Phase failed');
  });

  it('violates Phase 6 Validate when mutation score is below 80%', async () => {
    const callbacks = defaultCallbacks();
    callbacks.runValidate = async () => ({
      mutationScore: 75,
      diffAuditPassed: true,
      survivingMutants: ['mutant1'],
    });

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('VALIDATE');
    expect(result.error).toContain('Mutation test failed: score 75%');
  });

  it('violates Phase 6 Validate when diff scope audit fails', async () => {
    const callbacks = defaultCallbacks();
    callbacks.runValidate = async () => ({
      mutationScore: 90,
      diffAuditPassed: false,
      survivingMutants: [],
    });

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('VALIDATE');
    expect(result.error).toContain('Diff scope audit failed');
  });

  it('triggers timeout guardrail when wall clock limit is exceeded', async () => {
    const callbacks = defaultCallbacks();
    callbacks.runIntake = async () => {
      // Sleep to trigger timeout
      await new Promise((resolve) => setTimeout(resolve, 150));
      return mockTaskCard;
    };

    const result = await runWorkflowPipeline('raw', {
      callbacks,
      maxWallClockSeconds: 0.1, // 100ms
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout guardrail triggered');
  });

  it('triggers files modified guardrail when limit is exceeded', async () => {
    const callbacks = defaultCallbacks();

    const result = await runWorkflowPipeline('raw', {
      callbacks,
      maxFilesModified: 2,
      gitStats: async () => ({ filesModified: 3, linesChanged: 0 }),
    });

    expect(result.success).toBe(false);
    expect(result.phase).toBe('IMPLEMENT');
    expect(result.error).toContain('Files modified guardrail triggered');
  });

  it('triggers lines changed guardrail when limit is exceeded', async () => {
    const callbacks = defaultCallbacks();

    const result = await runWorkflowPipeline('raw', {
      callbacks,
      maxLinesChanged: 10,
      gitStats: async () => ({ filesModified: 1, linesChanged: 15 }),
    });

    expect(result.success).toBe(false);
    expect(result.phase).toBe('IMPLEMENT');
    expect(result.error).toContain('Lines changed guardrail triggered');
  });
});

describe('Confidence-Based Council Consensus & Compliance Veto', () => {
  const defaultVerdicts = (): CouncilVerdictInput[] => [
    {
      agentId: 'architect',
      agentRole: 'Architect',
      status: 'APPROVED',
      securityVeto: false,
      confidence: 1.0,
      findings: [],
      summary: 'Approved',
    },
    {
      agentId: 'delivery',
      agentRole: 'Delivery',
      status: 'APPROVED',
      securityVeto: false,
      confidence: 1.0,
      findings: [],
      summary: 'Approved',
    },
  ];

  it('returns ESCALATED if any single agent confidence is < 0.6', () => {
    const verdicts = [
      ...defaultVerdicts(),
      {
        agentId: 'devil',
        agentRole: 'Devil',
        status: 'APPROVED',
        securityVeto: false,
        confidence: 0.5, // below 0.6
        findings: [],
        summary: 'Low confidence approval',
      },
    ];

    const result = councilConsensus(verdicts);
    expect(result.status).toBe('ESCALATED');
    expect(result.summary).toContain('confidence below 0.6');
  });

  it('returns ESCALATED if average agent confidence is < 0.7', () => {
    const verdicts = [
      {
        agentId: 'architect',
        agentRole: 'Architect',
        status: 'APPROVED',
        securityVeto: false,
        confidence: 0.65,
        findings: [],
        summary: 'Approved',
      },
      {
        agentId: 'delivery',
        agentRole: 'Delivery',
        status: 'APPROVED',
        securityVeto: false,
        confidence: 0.65,
        findings: [],
        summary: 'Approved',
      },
    ];

    const result = councilConsensus(verdicts);
    expect(result.status).toBe('ESCALATED');
    expect(result.summary).toContain('average confidence (0.65) is below 0.7');
  });

  it('returns REJECTED with complianceVetoApplied if a compliance veto is active', () => {
    const verdicts = [
      ...defaultVerdicts(),
      {
        agentId: 'compliance',
        agentRole: 'Compliance Auditor',
        status: 'REJECTED',
        securityVeto: false,
        complianceVeto: true, // compliance veto
        findings: [{ category: 'compliance', severity: 'critical', message: 'PII leak', agentId: 'compliance' }],
        summary: 'Compliance veto applied',
      },
    ];

    const result = councilConsensus(verdicts);
    expect(result.status).toBe('REJECTED');
    expect(result.complianceVetoApplied).toBe(true);
    expect(result.vetoByAgentId).toBe('compliance');
    expect(result.summary).toContain('Compliance veto applied');
  });

  it('integrates confidence escalation into the unified pipeline loop', async () => {
    const callbacks = defaultCallbacks();
    // Return low confidence verdict
    callbacks.runCouncilReview = async () => [
      {
        agentId: 'architect',
        agentRole: 'Architect',
        status: 'APPROVED',
        securityVeto: false,
        confidence: 0.5, // triggers escalation
        findings: [],
        summary: 'Low confidence approval',
      },
    ];

    const result = await runWorkflowPipeline('raw', { callbacks });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('COUNCIL');
    expect(result.error).toContain('escalated the verdict');
  });
});
