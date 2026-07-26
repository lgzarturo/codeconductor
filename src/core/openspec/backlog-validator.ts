import type { BacklogDocumentInput, BacklogItemInput } from '../../validation/schemas';
import { BacklogDocumentSchema } from '../../validation/schemas';

export interface ValidationIssue {
  code: string;
  message: string;
  itemId?: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  recommendations: string[];
}

const VAGUE_PATTERNS = [
  /^mejorar\s/i,
  /^fix\s+bugs?$/i,
  /^refactor$/i,
  /^hacer\s+refactor/i,
  /^arreglar\s+bugs?/i,
  /^improve\s+ux$/i,
  /^better\s+ux$/i,
  /^cleanup$/i,
  /^misc$/i,
];

function allItems(doc: BacklogDocumentInput): BacklogItemInput[] {
  return [...doc.items, ...doc.archive];
}

function detectCycle(items: BacklogItemInput[]): string | null {
  const ids = new Set(items.map((i) => i.id));
  const graph = new Map<string, string[]>();
  for (const item of items) {
    graph.set(item.id, item.dependencies.filter((d) => ids.has(d)));
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (dfs(dep)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const id of ids) {
    if (dfs(id)) return id;
  }
  return null;
}

function isVagueCriterion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return true;
  return VAGUE_PATTERNS.some((p) => p.test(t));
}

/**
 * Validate a parsed backlog document with business rules beyond Zod schema.
 */
export function validateBacklog(doc: BacklogDocumentInput): ValidationReport {
  const errors: ValidationIssue[] = [];
  const recommendations: string[] = [];

  try {
    BacklogDocumentSchema.parse(doc);
  } catch (e) {
    errors.push({
      code: 'SCHEMA',
      message: e instanceof Error ? e.message : String(e),
    });
    return { valid: false, errors, recommendations: buildRecommendations(errors) };
  }

  const all = allItems(doc);
  const idCounts = new Map<string, number>();
  for (const item of all) {
    idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      errors.push({
        code: 'DUPLICATE_ID',
        message: `Duplicate backlog ID "${id}"`,
        itemId: id,
      });
    }
  }

  const knownIds = new Set(all.map((i) => i.id));

  for (const item of doc.items) {
    if (!item.description.trim()) {
      errors.push({
        code: 'MISSING_DESCRIPTION',
        message: `Item ${item.id} missing Description`,
        itemId: item.id,
      });
    }
    if (!item.scope.trim()) {
      errors.push({
        code: 'MISSING_SCOPE',
        message: `Item ${item.id} missing Scope`,
        itemId: item.id,
      });
    }
    if (item.acceptanceCriteria.length === 0) {
      errors.push({
        code: 'MISSING_ACCEPTANCE',
        message: `Item ${item.id} must have at least one Acceptance criterion`,
        itemId: item.id,
      });
    }
    for (const criterion of item.acceptanceCriteria) {
      if (isVagueCriterion(criterion)) {
        errors.push({
          code: 'VAGUE_ACCEPTANCE',
          message: `Item ${item.id} has vague acceptance criterion: "${criterion}"`,
          itemId: item.id,
        });
      }
    }
    for (const dep of item.dependencies) {
      if (!knownIds.has(dep)) {
        errors.push({
          code: 'UNKNOWN_DEPENDENCY',
          message: `Item ${item.id} depends on unknown ID "${dep}"`,
          itemId: item.id,
        });
      }
    }
  }

  const cycleId = detectCycle(doc.items);
  if (cycleId) {
    errors.push({
      code: 'DEPENDENCY_CYCLE',
      message: `Dependency cycle detected involving ${cycleId}`,
      itemId: cycleId,
    });
  }

  if (doc.items.length === 0 && doc.archive.length === 0) {
    recommendations.push('Add at least one item under ## Items with a unique BC-xxx ID.');
  }

  return {
    valid: errors.length === 0,
    errors,
    recommendations: buildRecommendations(errors, recommendations),
  };
}

function buildRecommendations(
  errors: ValidationIssue[],
  extra: string[] = []
): string[] {
  const recs = [...extra];
  if (errors.some((e) => e.code === 'SCHEMA' || e.code === 'MISSING_ACCEPTANCE')) {
    recs.push(
      'Use the canonical BACKLOG.md format: ## Global, ## Items, ### BC-001 | Title, with Priority, Status, Type, Depends on, Description, Scope, Acceptance list.'
    );
  }
  if (errors.some((e) => e.code === 'VAGUE_ACCEPTANCE')) {
    recs.push(
      'Acceptance criteria must be measurable (e.g. "openspec validate rejects malformed BACKLOG.md" not "improve UX").'
    );
  }
  if (errors.some((e) => e.code === 'UNKNOWN_DEPENDENCY' || e.code === 'DEPENDENCY_CYCLE')) {
    recs.push('Ensure Depends on lists only existing BC-xxx IDs with no circular dependencies.');
  }
  if (errors.some((e) => e.code === 'DUPLICATE_ID')) {
    recs.push('Each BC-xxx ID must appear only once across Items and Archive.');
  }
  return recs;
}
