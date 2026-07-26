import type { z } from 'zod';
import {
  AgentOutputSchema,
  ImplementerOutputSchema,
  PlannerOutputSchema,
  ReviewerOutputSchema,
  TechnicalPlanOutputSchema,
  validateImplementerOutput,
  validatePlannerOutput,
  validateReviewerOutput,
} from '../../validation/schemas';

export const OUTPUT_SCHEMA_NAMES = [
  'planner-output',
  'implementer-output',
  'review-report',
  'technical-plan',
  'fix-intake-output',
  'council-verdict',
  'agent-output',
] as const;

export type OutputSchemaName = (typeof OUTPUT_SCHEMA_NAMES)[number];

const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  'planner-output': PlannerOutputSchema,
  'implementer-output': ImplementerOutputSchema,
  'review-report': ReviewerOutputSchema,
  'technical-plan': TechnicalPlanOutputSchema,
  'fix-intake-output': AgentOutputSchema,
  'council-verdict': AgentOutputSchema,
  'agent-output': AgentOutputSchema,
};

export interface ValidationResult {
  readonly valid: boolean;
  readonly schema: string;
  readonly errors?: string[];
  readonly data?: unknown;
}

export function resolveOutputSchemaName(
  schemaName: string,
  role?: string,
): string {
  if (schemaName !== 'agent-output' && SCHEMA_REGISTRY[schemaName]) {
    return schemaName;
  }
  if (role === 'implementer') {
    return 'implementer-output';
  }
  if (role === 'reviewer') {
    return 'review-report';
  }
  if (role === 'task-coach' || role === 'architect') {
    return schemaName === 'technical-plan' ? 'technical-plan' : 'planner-output';
  }
  return schemaName;
}

export function validateAgentOutputBySchema(
  schemaName: string,
  data: unknown,
  role?: string,
): ValidationResult {
  const resolved = resolveOutputSchemaName(schemaName, role);
  const schema = SCHEMA_REGISTRY[resolved] ?? AgentOutputSchema;

  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { valid: true, schema: resolved, data: parsed.data };
  }

  return {
    valid: false,
    schema: resolved,
    errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

export function parseJsonInput(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

/** Role-aware validators used by tests and CLI. */
export function validateOutputForRole(
  role: string,
  outputSchema: string,
  data: unknown,
): ValidationResult {
  if (role === 'implementer') {
    try {
      return { valid: true, schema: 'implementer-output', data: validateImplementerOutput(data) };
    } catch (err) {
      return {
        valid: false,
        schema: 'implementer-output',
        errors: [String(err)],
      };
    }
  }
  if (role === 'reviewer') {
    try {
      return { valid: true, schema: 'review-report', data: validateReviewerOutput(data) };
    } catch (err) {
      return {
        valid: false,
        schema: 'review-report',
        errors: [String(err)],
      };
    }
  }
  if (outputSchema === 'planner-output' || role === 'task-coach') {
    try {
      return { valid: true, schema: 'planner-output', data: validatePlannerOutput(data) };
    } catch (err) {
      return {
        valid: false,
        schema: 'planner-output',
        errors: [String(err)],
      };
    }
  }
  return validateAgentOutputBySchema(outputSchema, data, role);
}
