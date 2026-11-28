import type { z } from 'zod';
import {
  AgentOutputSchema,
  ApiContractOutputSchema,
  CanonicalTaskCardSchema,
  ComplexityAuditOutputSchema,
  CouncilVerdictSchema,
  FixIntakeOutputSchema,
  ImplementerOutputSchema,
  PagespeedReportOutputSchema,
  PlannerOutputSchema,
  ReviewerOutputSchema,
  ScorecardRecordSchema,
  TechnicalPlanOutputSchema,
  TestPlanOutputSchema,
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
  'taskcard',
  'test-plan',
  'complexity-audit',
  'api-contract',
  'pagespeed-report',
  'scorecard-record',
] as const;

export type OutputSchemaName = (typeof OUTPUT_SCHEMA_NAMES)[number];

/** Schemas that must not resolve to the generic agent envelope. */
export const SPECIALIZED_OUTPUT_SCHEMAS = [
  'test-plan',
  'complexity-audit',
  'api-contract',
  'pagespeed-report',
] as const;

const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  'planner-output': PlannerOutputSchema,
  'implementer-output': ImplementerOutputSchema,
  'review-report': ReviewerOutputSchema,
  'technical-plan': TechnicalPlanOutputSchema,
  'fix-intake-output': FixIntakeOutputSchema,
  'council-verdict': CouncilVerdictSchema,
  'agent-output': AgentOutputSchema,
  taskcard: CanonicalTaskCardSchema,
  'test-plan': TestPlanOutputSchema,
  'complexity-audit': ComplexityAuditOutputSchema,
  'api-contract': ApiContractOutputSchema,
  'pagespeed-report': PagespeedReportOutputSchema,
  'scorecard-record': ScorecardRecordSchema,
};

export function isRegisteredOutputSchema(name: string): boolean {
  return SCHEMA_REGISTRY[name] !== undefined;
}

export function getRegisteredOutputSchema(name: string): z.ZodTypeAny | undefined {
  return SCHEMA_REGISTRY[name];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly schema: string;
  readonly errors?: string[];
  readonly data?: unknown;
}

/**
 * Resolve a schema name for validation.
 * Role remapping applies only to the generic `agent-output` alias.
 * Unknown schema identifiers are returned unchanged so validation fails closed.
 */
export function resolveOutputSchemaName(
  schemaName: string,
  role?: string,
): string {
  if (schemaName !== 'agent-output') {
    return schemaName;
  }
  if (role === 'implementer') {
    return 'implementer-output';
  }
  if (role === 'reviewer') {
    return 'review-report';
  }
  if (role === 'task-coach' || role === 'architect') {
    return 'planner-output';
  }
  return schemaName;
}

function validateResolvedOutputSchema(
  schemaName: string,
  data: unknown,
): ValidationResult {
  const schema = SCHEMA_REGISTRY[schemaName];
  if (!schema) {
    return {
      valid: false,
      schema: schemaName,
      errors: [`Unknown output schema: ${schemaName}`],
    };
  }

  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { valid: true, schema: schemaName, data: parsed.data };
  }

  return {
    valid: false,
    schema: schemaName,
    errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

export function validateAgentOutputBySchema(
  schemaName: string,
  data: unknown,
  role?: string,
): ValidationResult {
  const resolved = resolveOutputSchemaName(schemaName, role);
  return validateResolvedOutputSchema(resolved, data);
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
  const resolved = resolveOutputSchemaName(outputSchema, role);

  if (resolved === 'implementer-output') {
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
  if (resolved === 'review-report') {
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
  if (resolved === 'planner-output') {
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
  return validateResolvedOutputSchema(resolved, data);
}
