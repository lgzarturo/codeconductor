import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  OUTPUT_SCHEMA_NAMES,
  isRegisteredOutputSchema,
  parseJsonInput,
  resolveOutputSchemaName,
  validateAgentOutputBySchema,
  validateOutputForRole,
} from '../../../../src/core/ccep/output-validator';

const agentOutput = { status: 'success', confidence: 0.8 };
const plannerOutput = {
  status: 'success',
  confidence: 0.9,
  goal: 'g',
  assumptions: [],
  risks: [],
  tasks: [],
  questionsForUser: [],
  needsConfirmation: false,
};
const implementerOutput = { status: 'success', confidence: 0.8 };
const reviewerOutput = { status: 'pass', confidence: 0.9, verdict: 'approved' };

describe('core/ccep/output-validator', () => {
  test('exposes registered output schema names', () => {
    expect(OUTPUT_SCHEMA_NAMES).toContain('planner-output');
    expect(OUTPUT_SCHEMA_NAMES).toContain('council-verdict');
    expect(OUTPUT_SCHEMA_NAMES).toContain('taskcard');
  });

  describe('resolveOutputSchemaName', () => {
    test('a known non-generic schema resolves to itself', () => {
      expect(resolveOutputSchemaName('planner-output')).toBe('planner-output');
    });

    test('role implementer maps to implementer-output', () => {
      expect(resolveOutputSchemaName('agent-output', 'implementer')).toBe('implementer-output');
    });

    test('role reviewer maps to review-report', () => {
      expect(resolveOutputSchemaName('agent-output', 'reviewer')).toBe('review-report');
    });

    test('architect/task-coach map to planner-output, or technical-plan when requested', () => {
      expect(resolveOutputSchemaName('agent-output', 'architect')).toBe('planner-output');
      expect(resolveOutputSchemaName('technical-plan', 'task-coach')).toBe('technical-plan');
    });

    test('an unknown schema with no special role is returned unchanged', () => {
      expect(resolveOutputSchemaName('agent-output', 'docs')).toBe('agent-output');
    });
  });

  describe('validateAgentOutputBySchema', () => {
    test('valid agent output passes', () => {
      const result = validateAgentOutputBySchema('agent-output', agentOutput);
      expect(result.valid).toBe(true);
      expect(result.schema).toBe('agent-output');
      expect(result.data).toBeDefined();
    });

    test('role-aware resolution validates against the implementer schema', () => {
      const result = validateAgentOutputBySchema('agent-output', implementerOutput, 'implementer');
      expect(result.valid).toBe(true);
      expect(result.schema).toBe('implementer-output');
    });

    test('invalid payload returns errors', () => {
      const result = validateAgentOutputBySchema('planner-output', { status: 'success' });
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('parseJsonInput', () => {
    test('parses valid JSON', () => {
      expect(parseJsonInput('{"a":1}')).toEqual({ a: 1 });
    });

    test('throws on malformed JSON', () => {
      expect(() => parseJsonInput('{not json')).toThrow();
    });
  });

  describe('validateOutputForRole', () => {
    test('implementer role: valid and invalid payloads', () => {
      expect(validateOutputForRole('implementer', 'agent-output', implementerOutput).valid).toBe(true);
      const bad = validateOutputForRole('implementer', 'agent-output', { status: 'nope' });
      expect(bad.valid).toBe(false);
      expect(bad.schema).toBe('implementer-output');
    });

    test('reviewer role validates the review report', () => {
      expect(validateOutputForRole('reviewer', 'agent-output', reviewerOutput).valid).toBe(true);
      expect(validateOutputForRole('reviewer', 'agent-output', {}).valid).toBe(false);
    });

    test('planner-output schema (or task-coach role) validates the planner shape', () => {
      expect(validateOutputForRole('task-coach', 'planner-output', plannerOutput).valid).toBe(true);
      expect(validateOutputForRole('anyone', 'planner-output', {}).valid).toBe(false);
    });

    test('falls back to schema validation for other roles', () => {
      const result = validateOutputForRole('docs', 'agent-output', agentOutput);
      expect(result.valid).toBe(true);
      expect(result.schema).toBe('agent-output');
    });
  });

  test('every workflow YAML outputSchema is registered', () => {
    const dir = join(import.meta.dir, '../../../../src/core/ccep/workflows');
    const names = new Set<string>();
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.yml'))) {
      const doc = parseYaml(readFileSync(join(dir, file), 'utf-8')) as {
        phases?: Array<{ outputSchema?: string }>;
      };
      for (const phase of doc.phases ?? []) {
        if (phase.outputSchema) names.add(phase.outputSchema);
      }
    }
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect(isRegisteredOutputSchema(name)).toBe(true);
    }
    for (const name of OUTPUT_SCHEMA_NAMES) {
      expect(isRegisteredOutputSchema(name)).toBe(true);
    }
  });

  test('agent-output shape does not validate as council-verdict', () => {
    const result = validateAgentOutputBySchema('council-verdict', {
      status: 'success',
      confidence: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.schema).toBe('council-verdict');
  });

  test('unknown schema names fail closed', () => {
    const result = validateAgentOutputBySchema('not-a-schema', { status: 'success', confidence: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors?.join(' ')).toContain('Unknown output schema');
  });
});
