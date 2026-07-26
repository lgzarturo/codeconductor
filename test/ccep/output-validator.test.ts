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
