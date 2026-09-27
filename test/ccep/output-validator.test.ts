import { describe, expect, test } from 'bun:test';
import {
  parseJsonInput,
  validateAgentOutputBySchema,
  validateOutputForRole,
} from '../../src/core/ccep/output-validator';

describe('ccep output-validator', () => {
  test('validates planner-output', () => {
    const result = validateOutputForRole('task-coach', 'planner-output', {
      status: 'success',
      confidence: 0.9,
      goal: 'Add CRUD',
      assumptions: [],
      risks: [],
      tasks: [],
      questionsForUser: [],
      needsConfirmation: false,
    });
    expect(result.valid).toBe(true);
    expect(result.schema).toBe('planner-output');
  });

  test('rejects invalid planner-output', () => {
    const result = validateOutputForRole('task-coach', 'planner-output', {
      status: 'success',
      goal: 'missing fields',
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  test('validates task-coach technical-plan output with the technical-plan schema', () => {
    const result = validateOutputForRole('task-coach', 'technical-plan', {
      approach: 'Keep routing and context transfer independent',
      filesAffected: ['src/core/ccep/prompt-compiler.ts'],
      risks: ['Prompt compatibility'],
      openQuestions: [],
    });

    expect(result.valid).toBe(true);
    expect(result.schema).toBe('technical-plan');
  });

  test('validates task-coach fix intake output with the explicit phase schema', () => {
    const result = validateOutputForRole('task-coach', 'fix-intake-output', {
      actualBehavior: 'Login fails on Safari',
      expectedBehavior: 'Login succeeds',
      reproductionSteps: ['Open Safari', 'Submit valid credentials'],
    });

    expect(result.valid).toBe(true);
    expect(result.schema).toBe('fix-intake-output');
  });

  test('validates reviewer scorecard output with the explicit phase schema', () => {
    const result = validateOutputForRole('reviewer', 'scorecard-record', {
      id: 'score-1',
      taskId: 'task-1',
      agent: 'reviewer',
      contractVersion: 'v1.0.0',
      criteria: [],
      weightedScore: 3,
      verdict: 'PASS',
      findings: [],
      createdAt: '2026-09-26T12:00:00.000Z',
    });

    expect(result.valid).toBe(true);
    expect(result.schema).toBe('scorecard-record');
  });

  test('validates implementer-output', () => {
    const result = validateOutputForRole('implementer', 'agent-output', {
      status: 'success',
      confidence: 0.95,
      warnings: [],
      artifacts: [],
      next_actions: [],
      filesChanged: [{ path: 'src/a.ts', summary: 'Added handler' }],
      tests: { runner: 'bun test', result: 'passed' },
    });
    expect(result.valid).toBe(true);
    expect(result.schema).toBe('implementer-output');
  });

  test('validates review-report', () => {
    const result = validateOutputForRole('reviewer', 'review-report', {
      status: 'pass',
      confidence: 0.88,
      verdict: 'approved_with_warnings',
      warnings: [],
      findings: [
        { severity: 'WARNING', message: 'Missing test', axis: 'test_coverage' },
      ],
      artifacts: [],
      next_actions: [],
    });
    expect(result.valid).toBe(true);
    expect(result.schema).toBe('review-report');
  });

  test('parseJsonInput parses JSON strings', () => {
    const data = parseJsonInput('{"status":"success","confidence":1}');
    expect(data).toEqual({ status: 'success', confidence: 1 });
  });

  test('validateAgentOutputBySchema resolves role-specific schema', () => {
    const result = validateAgentOutputBySchema('agent-output', {
      status: 'success',
      confidence: 0.5,
      warnings: [],
      artifacts: [],
      next_actions: [],
      filesChanged: [],
    }, 'implementer');
    expect(result.valid).toBe(true);
    expect(result.schema).toBe('implementer-output');
  });
});
