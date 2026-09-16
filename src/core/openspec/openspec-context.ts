import type { ExecutionContextInput } from '../../validation/schemas';

export interface OpenspecPhaseContext {
  readonly phase: string;
  readonly task: Record<string, unknown>;
  readonly knowledge: Record<string, unknown>;
}

/**
 * Keep OpenSpec phase prompts focused on the information each role can act on.
 * Durable artifacts are intentionally referenced by their change path in the
 * task instead of duplicating their full Markdown in every prompt.
 */
export function buildOpenspecPhaseContext(
  context: ExecutionContextInput,
  phase: string,
): OpenspecPhaseContext {
  const active = context.knowledge.openspec;
  const artifactRoot =
    typeof active === 'object' && active !== null &&
    typeof (active as { changePath?: unknown }).changePath === 'string'
      ? (active as { changePath: string }).changePath
      : 'openspec/changes/<active-change>';
  const baseTask = {
    command: context.envelope.command,
    goal: context.intent.goal,
    domain: context.intent.domain,
    project: context.project.name,
    artifactRoot,
  };
  const knowledge = context.knowledge;

  if (phase === 'discover') {
    return {
      phase,
      task: { ...baseTask, reads: ['proposal.md', 'specs/**/spec.md'] },
      knowledge: { domains: knowledge.domains ?? [] },
    };
  }
  if (phase === 'design') {
    return {
      phase,
      task: { ...baseTask, reads: ['proposal.md', 'specs/**/spec.md', 'discover output'] },
      knowledge: { decisions: knowledge.decisions ?? [] },
    };
  }
  if (phase === 'test') {
    return {
      phase,
      task: { ...baseTask, reads: ['specs/**/spec.md', 'tasks.md'] },
      knowledge: { requirements: knowledge.requirements ?? [] },
    };
  }
  if (phase === 'implement') {
    return {
      phase,
      task: { ...baseTask, reads: ['tasks.md', 'specs/**/spec.md', 'design.md', 'test output'] },
      knowledge: { decisions: knowledge.decisions ?? [] },
    };
  }
  return {
    phase,
    task: { ...baseTask, reads: ['proposal.md', 'specs/**/spec.md', 'tasks.md', 'review evidence'] },
    knowledge: { requirements: knowledge.requirements ?? [], risks: knowledge.risks ?? [] },
  };
}
