import { describe, expect, test } from 'bun:test';
import {
  validateAgentContract,
  validateAgentOutput,
  validateBacklogDocument,
  validateCanonicalTaskCard,
  validateClaudeAgentFile,
  validateCommandEnvelope,
  validateConfig,
  validateConsensusConfig,
  validateCouncilSpec,
  validateCouncilVerdict,
  validateCouncilVerdictInput,
  validateDecision,
  validateEvidence,
  validateExecutionContext,
  validateGoalGraph,
  validateImplementerOutput,
  validateKnowledgeEntity,
  validateMemoryIndex,
  validateMemoryPointer,
  validateModelConfig,
  validateOpenCodeAgentFile,
  validateOpenspecState,
  validatePlannerOutput,
  validateProductEvent,
  validateProductGraph,
  validateProjectProfile,
  validateReviewerOutput,
  validateRunnerTarget,
  validateScorecardRecord,
  validateTaskOutcome,
  validateWorkflowProfile,
} from '../../../src/validation/schemas';
import { councilConsensus } from '../../../src/domain/council/council-consensus';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const councilSpec = {
  name: 'council',
  version: '0.1.0',
  description: 'd',
  outputContract: 'v1',
  agents: [{ id: 'a', role: 'r', context: 'repo-readonly', modelHint: 'balanced', focus: ['x'] }],
};

const projectProfile = {
  rootDir: '/tmp',
  languages: ['ts'],
  runtimes: ['node'],
  packageManagers: ['bun'],
  frameworks: [],
  signals: ['package.json'],
  confidence: 'high',
};

const config = {
  version: '1',
  project: { name: 'p' },
  defaults: { target: 'claude', overwrite: false },
  presets: { council: { enabled: true, version: '0.1.0' } },
  safety: { destructiveCommands: [], secretPatterns: [] },
};

const modelConfig = { target: 'claude', agents: { architect: { claude: 'opus' } } };

const agentContract = { council: councilSpec, targets: [{ target: 'claude' }], contractVersion: '1.0.0' };

const councilVerdictInput = {
  agentId: 'a',
  agentRole: 'r',
  status: 'APPROVED',
  securityVeto: false,
  findings: [],
  summary: 's',
};

const councilVerdict = {
  status: 'APPROVED',
  totalAgents: 1,
  approvedCount: 1,
  rejectedCount: 0,
  abstainedCount: 0,
  vetoApplied: false,
  findings: [],
  summary: 's',
  individualVerdicts: [councilVerdictInput],
};

const goalGraph = {
  objective: 'o',
  tasks: [{ id: 't1', title: 'T', type: 'feature', risk: 'low', status: 'pending', acceptance_criteria: ['a'] }],
  created_at: '2026-07-26',
};

const memoryPointer = { topic_key: 'k', id: 1, file: 'f', summary: 's', timestamp: '2026-07-26T00:00:00Z' };

const backlogDocument = {
  global: { product: 'P', strategy: 'S', policy: 'PO', reviewRequired: true, tddRequired: true },
  items: [
    {
      id: 'BC-001',
      title: 'T',
      priority: 'P1',
      status: 'TODO',
      type: 'feature',
      description: 'd',
      scope: 's',
      acceptanceCriteria: ['a'],
      progress: 0,
    },
  ],
};

const scorecardRecord = {
  id: 'sc1',
  taskId: 't1',
  agent: 'reviewer',
  contractVersion: '1.0.0',
  criteria: [{ id: 'acceptance', label: 'Acceptance', weight: 0.2, score: 3 }],
  weightedScore: 2.5,
  verdict: 'PASS',
  createdAt: '2026-07-26',
};

const taskOutcome = {
  id: 'o1',
  taskId: 't1',
  source: 'review',
  agent: 'reviewer',
  model: 'opus',
  contractVersion: '1.0.0',
  timestamp: '2026-07-26',
};

const commandEnvelope = {
  protocolVersion: 'ccep-1',
  command: 'feature',
  userRequest: 'do x',
  projectId: 'p1',
  repoContext: { stack: ['node'], existingModules: [] },
  constraints: { outputFormat: 'plan', needConfirmation: false, riskThreshold: 'low' },
  executionPolicy: { modelMode: 'structured', maxVariance: 'low' },
};

const workflowProfile = {
  id: 'feature',
  version: 1,
  command: 'feature',
  phases: [{ id: 'intake' }],
  routing: { default: ['architect'] },
  confirmationGate: { stopOnHighRisk: true, stopOnQuestions: true },
};

const executionContext = {
  envelope: commandEnvelope,
  profile: workflowProfile,
  intent: { type: 'feature', goal: 'g' },
  project: { name: 'p', rootDir: '/tmp' },
  ast: { source: 'detect', confidence: 'low' },
  policies: { architecture: 'a', testing: 't', documentation: 'd', breakingChanges: 'b' },
  outputSchema: 'agent-output',
};

const cases: Array<[string, (d: unknown) => unknown, unknown]> = [
  ['validateCouncilSpec', validateCouncilSpec, councilSpec],
  ['validateProjectProfile', validateProjectProfile, projectProfile],
  ['validateConfig', validateConfig, config],
  ['validateRunnerTarget', validateRunnerTarget, 'all'],
  ['validateModelConfig', validateModelConfig, modelConfig],
  ['validateAgentContract', validateAgentContract, agentContract],
  ['validateCouncilVerdictInput', validateCouncilVerdictInput, councilVerdictInput],
  ['validateConsensusConfig', validateConsensusConfig, { algorithm: 'majority', allowSecurityVeto: true }],
  ['validateCouncilVerdict', validateCouncilVerdict, councilVerdict],
  ['validateClaudeAgentFile', validateClaudeAgentFile, { path: '.claude/agents/x.md', content: 'c', overwrite: false }],
  ['validateOpenCodeAgentFile', validateOpenCodeAgentFile, { path: '.opencode/agents/x.md', content: 'c', overwrite: false }],
  ['validateGoalGraph', validateGoalGraph, goalGraph],
  ['validateMemoryPointer', validateMemoryPointer, memoryPointer],
  ['validateMemoryIndex', validateMemoryIndex, { version: 1, pointers: [memoryPointer] }],
  ['validateBacklogDocument', validateBacklogDocument, backlogDocument],
  ['validateOpenspecState', validateOpenspecState, { version: 1 }],
  ['validateScorecardRecord', validateScorecardRecord, scorecardRecord],
  ['validateTaskOutcome', validateTaskOutcome, taskOutcome],
  ['validateCommandEnvelope', validateCommandEnvelope, commandEnvelope],
  ['validateWorkflowProfile', validateWorkflowProfile, workflowProfile],
  ['validateExecutionContext', validateExecutionContext, executionContext],
  ['validatePlannerOutput', validatePlannerOutput, {
    status: 'success', confidence: 0.9, goal: 'g', assumptions: [], risks: [], tasks: [],
    questionsForUser: [], needsConfirmation: false,
  }],
  ['validateAgentOutput', validateAgentOutput, { status: 'success', confidence: 0.8 }],
  ['validateImplementerOutput', validateImplementerOutput, { status: 'success', confidence: 0.8 }],
  ['validateReviewerOutput', validateReviewerOutput, { status: 'pass', confidence: 0.9, verdict: 'approved' }],
  ['validateProductGraph', validateProductGraph, {
    version: 1, productId: 'p', productName: 'P', nodes: [], edges: [], updatedAt: '2026-07-26T00:00:00Z',
  }],
  ['validateKnowledgeEntity', validateKnowledgeEntity, { type: 'domain', id: 'd1', name: 'D', source: 's', confidence: 'high' }],
  ['validateDecision', validateDecision, { id: 'dec1', context: 'c', chosenOption: 'o', rationale: 'r', date: '2026-07-26' }],
  ['validateEvidence', validateEvidence, { id: 'e1', source: 's', type: 't', timestamp: '2026-07-26', confidence: 0.5 }],
  ['validateCanonicalTaskCard', validateCanonicalTaskCard, {
    id: 't1', title: 'T', objective: 'o', context: 'c', acceptanceCriteria: ['a'],
    risk: 'low', agentType: 'implementer', status: 'ready',
  }],
  ['validateProductEvent', validateProductEvent, { id: 'ev1', type: 'task.started', timestamp: '2026-07-26' }],
];

describe('validation/schemas', () => {
  describe('happy path: every validator accepts a well-formed payload', () => {
    for (const [name, fn, fixture] of cases) {
      test(name, () => {
        expect(fn(fixture)).toBeDefined();
      });
    }
  });

  describe('error case: validators reject malformed payloads', () => {
    test('validateRunnerTarget rejects an unknown target', () => {
      expect(() => validateRunnerTarget('vscode')).toThrow();
    });

    test('validateConfig rejects an empty object', () => {
      expect(() => validateConfig({})).toThrow();
    });

    test('validateCouncilSpec rejects a missing agents array', () => {
      expect(() => validateCouncilSpec({ name: 'x', version: '1', description: 'd', outputContract: 'v1' })).toThrow();
    });

    test('validateMemoryPointer rejects a non-ISO timestamp', () => {
      expect(() => validateMemoryPointer({ ...memoryPointer, timestamp: 'not-a-date' })).toThrow();
    });

    test('validateBacklogDocument rejects an item id that breaks the BC-### pattern', () => {
      const bad = { ...backlogDocument, items: [{ ...backlogDocument.items[0], id: 'X-1' }] };
      expect(() => validateBacklogDocument(bad)).toThrow();
    });

    test('validateWorkflowProfile rejects a profile whose id does not match its command', () => {
      expect(() => validateWorkflowProfile({ ...workflowProfile, id: 'fix' })).toThrow();
    });
  });

  describe('defaults are applied by the schema', () => {
    test('validateOpenspecState fills array/record defaults', () => {
      const state = validateOpenspecState({ version: 1 }) as {
        taskCards: unknown[];
        changePaths: Record<string, string>;
      };
      expect(state.taskCards).toEqual([]);
      expect(state.changePaths).toEqual({});
    });

    test('validateMemoryPointer defaults tags to an empty array', () => {
      const pointer = validateMemoryPointer(memoryPointer) as { tags: string[] };
      expect(pointer.tags).toEqual([]);
    });
  });

  describe('council consensus schema round-trips', () => {
    test('validateConsensusConfig preserves compliance veto and unanimous roster settings', () => {
      const input = {
        algorithm: 'unanimous' as const,
        allowSecurityVeto: true,
        allowComplianceVeto: false,
        expectedAgentIds: ['architect', 'security', 'compliance'],
      };

      expect(validateConsensusConfig(input)).toEqual(input);
    });

    test('validateConsensusConfig rejects an empty expected roster', () => {
      expect(() => validateConsensusConfig({
        algorithm: 'unanimous',
        allowSecurityVeto: true,
        expectedAgentIds: [],
      })).toThrow();
    });

    test('validateConsensusConfig rejects blank agent IDs in the expected roster', () => {
      expect(() => validateConsensusConfig({
        algorithm: 'unanimous',
        allowSecurityVeto: true,
        expectedAgentIds: ['architect', '   '],
      })).toThrow();
    });

    test('validateConsensusConfig rejects duplicate roster aliases after trim and case folding', () => {
      expect(() => validateConsensusConfig({
        algorithm: 'unanimous',
        allowSecurityVeto: true,
        expectedAgentIds: ['architect', ' Architect '],
      })).toThrow();
    });

    test('validateCouncilVerdictInput rejects a blank agent ID', () => {
      expect(() => validateCouncilVerdictInput({
        ...councilVerdictInput,
        agentId: '   ',
      })).toThrow();
    });

    test('validated compliance veto survives consensus and verdict validation', () => {
      const approved = {
        ...councilVerdictInput,
        agentId: 'architect',
      };
      const compliance = {
        ...councilVerdictInput,
        agentId: 'compliance',
        agentRole: 'compliance',
        status: 'REJECTED' as const,
        complianceVeto: true,
      };
      const config = validateConsensusConfig({
        algorithm: 'majority',
        allowSecurityVeto: true,
        allowComplianceVeto: true,
      });
      const verdict = councilConsensus(
        [validateCouncilVerdictInput(approved), validateCouncilVerdictInput(compliance)],
        config,
      );

      expect(validateCouncilVerdict(verdict)).toMatchObject({
        status: 'REJECTED',
        complianceVetoApplied: true,
        vetoByAgentId: 'compliance',
      });
    });

    test('validated confidence survives consensus and verdict validation', () => {
      const lowConfidence = {
        ...councilVerdictInput,
        confidence: 0.5,
      };
      const config = validateConsensusConfig({
        algorithm: 'majority',
        allowSecurityVeto: true,
      });
      const verdict = councilConsensus(
        [validateCouncilVerdictInput(lowConfidence)],
        config,
      );

      expect(validateCouncilVerdict(verdict)).toMatchObject({
        status: 'ESCALATED',
        averageConfidence: 0.5,
      });
    });
  });
});
