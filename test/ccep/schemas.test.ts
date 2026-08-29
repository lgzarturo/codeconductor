import { describe, expect, test } from 'bun:test';
import {
  validateCommandEnvelope,
  validateExecutionContext,
  validatePlannerOutput,
  validateWorkflowProfile,
  WorkflowCommandSchema,
} from '../../src/validation/schemas';

describe('ccep schemas', () => {
  test('WorkflowCommandSchema accepts all 19 slash commands', () => {
    const commands = [
      'feature',
      'fix',
      'refactor',
      'review',
      'test-plan',
      'tdd-cycle',
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
    ];

    for (const command of commands) {
      expect(WorkflowCommandSchema.parse(command)).toBe(command);
    }
  });

  test('CommandEnvelopeSchema requires explicit command field', () => {
    expect(() =>
      validateCommandEnvelope({
        protocolVersion: 'ccep-1',
        userRequest: 'do something',
        projectId: 'test',
        repoContext: { stack: [], existingModules: [] },
        constraints: {
          outputFormat: 'taskcard',
          needConfirmation: true,
          riskThreshold: 'medium',
        },
        executionPolicy: { modelMode: 'structured', maxVariance: 'low' },
      }),
    ).toThrow();

    const valid = validateCommandEnvelope({
      protocolVersion: 'ccep-1',
      command: 'fix',
      userRequest: 'login fails',
      projectId: 'test',
      repoContext: { stack: ['typescript'], existingModules: [] },
      constraints: {
        outputFormat: 'taskcard',
        needConfirmation: false,
        riskThreshold: 'medium',
      },
      executionPolicy: { modelMode: 'structured', maxVariance: 'low' },
    });

    expect(valid.command).toBe('fix');
  });

  test('ExecutionContextSchema binds envelope to workflow profile', () => {
    const ctx = validateExecutionContext({
      envelope: {
        protocolVersion: 'ccep-1',
        command: 'feature',
        userRequest: 'Add CRUD',
        projectId: 'app',
        repoContext: { stack: ['typescript'], existingModules: [] },
        constraints: {
          outputFormat: 'taskcard',
          needConfirmation: true,
          riskThreshold: 'medium',
        },
        executionPolicy: { modelMode: 'structured', maxVariance: 'low' },
      },
      profile: {
        id: 'feature',
        version: 1,
        command: 'feature',
        phases: [{ id: 'intake', agent: 'task-coach', outputSchema: 'planner-output' }],
        routing: { default: ['intake'] },
        confirmationGate: { stopOnHighRisk: true, stopOnQuestions: true },
      },
      intent: { type: 'feature', goal: 'Add CRUD' },
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
    });

    expect(ctx.envelope.command).toBe('feature');
    expect(ctx.profile.id).toBe('feature');
  });

  test('PlannerOutputSchema enforces structured planner contract', () => {
    const output = validatePlannerOutput({
      status: 'success',
      confidence: 0.9,
      goal: 'Implement benefits CRUD',
      assumptions: ['Admin-only access'],
      risks: [{ type: 'domain_overlap', description: 'May duplicate logic', severity: 'medium' }],
      tasks: [
        { id: 'T1', title: 'Define Benefit model', priority: 'P0', estimate: 'S', dependencies: [] },
      ],
      questionsForUser: [],
      needsConfirmation: true,
    });

    expect(output.tasks).toHaveLength(1);
    expect(output.needsConfirmation).toBe(true);
  });

  test('WorkflowProfileSchema rejects profile with mismatched command id', () => {
    expect(() =>
      validateWorkflowProfile({
        id: 'feature',
        version: 1,
        command: 'fix',
        phases: [],
        routing: { default: [] },
        confirmationGate: { stopOnHighRisk: false, stopOnQuestions: false },
      }),
    ).toThrow();
  });
});
