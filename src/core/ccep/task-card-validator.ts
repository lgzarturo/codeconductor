import type { CanonicalTaskCardInput, WorkflowProfileInput } from '../../validation/schemas';
import { CanonicalTaskCardSchema } from '../../validation/schemas';
import { isVagueCriterion } from '../shared/vague-criterion';

export interface ValidationIssue {
  code: string;
  message: string;
  itemId?: string;
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((entry) => isNonEmpty(entry));
  }
  return true;
}

function fieldValue(card: CanonicalTaskCardInput, field: string): unknown {
  if (field === 'scope') {
    return card.targetFiles;
  }
  return (card as Record<string, unknown>)[field];
}

/**
 * Profile-aware TaskCard gate. Returns issues; empty means the card is routable.
 */
export function validateTaskCardForProfile(
  profile: WorkflowProfileInput,
  card: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = CanonicalTaskCardSchema.safeParse(card);
  if (!parsed.success) {
    issues.push({
      code: 'SCHEMA',
      message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    });
    return issues;
  }

  const data = parsed.data;
  const required = profile.taskCard?.requiredFields ?? [];
  for (const field of required) {
    if (!isNonEmpty(fieldValue(data, field))) {
      issues.push({
        code: 'MISSING_FIELD',
        message: `Required field "${field}" is missing or empty`,
        itemId: data.id,
      });
    }
  }

  if (data.status === 'draft') {
    issues.push({
      code: 'NOT_ROUTABLE',
      message: 'TaskCard status "draft" is not routable',
      itemId: data.id,
    });
  }

  if (data.risk === 'high' && data.requiresHumanReview !== true) {
    issues.push({
      code: 'HIGH_RISK_REVIEW',
      message: 'risk: high requires requiresHumanReview: true',
      itemId: data.id,
    });
  }

  if (data.type !== 'docs' && data.type !== 'review' && data.requiresTests !== true) {
    issues.push({
      code: 'TESTS_REQUIRED',
      message: `type "${data.type}" requires requiresTests: true`,
      itemId: data.id,
    });
  }

  for (const criterion of data.acceptanceCriteria) {
    if (isVagueCriterion(criterion)) {
      issues.push({
        code: 'VAGUE_ACCEPTANCE',
        message: `Vague acceptance criterion: "${criterion}"`,
        itemId: data.id,
      });
    }
  }

  return issues;
}
