import { planGoal } from '../goal/goal-planner';
import type { GoalGraphInput, GoalTaskInput, ProductGraphInput } from '../../validation/schemas';
import { queryNodes } from '../product-graph/graph-store';

const RISK_TO_AGENT: Record<string, string> = {
  low: 'implementer',
  medium: 'architect',
  high: 'task-coach',
};

function inferAgentType(task: GoalTaskInput): string {
  if (task.type === 'test') return 'tester';
  if (task.type === 'docs') return 'docs';
  if (task.risk === 'high' && task.type === 'feature') return 'architect';
  return RISK_TO_AGENT[task.risk] ?? 'implementer';
}

function inferTargetFiles(task: GoalTaskInput, graph?: ProductGraphInput): string[] {
  if (!graph) return [];
  const keywords = task.title.toLowerCase().split(/\s+/);
  const components = queryNodes(graph, 'component');
  const matched: string[] = [];
  for (const node of components) {
    const path = (node.data as { path?: string }).path;
    if (!path) continue;
    const nameLower = node.name.toLowerCase();
    if (keywords.some((k) => nameLower.includes(k) || path.toLowerCase().includes(k))) {
      matched.push(path);
    }
  }
  return matched.slice(0, 10);
}

function inferEvidenceRequired(task: GoalTaskInput): string[] {
  const base = ['acceptance_criteria_met'];
  if (task.type === 'test' || task.risk !== 'low') {
    base.push('tests_passed');
  }
  if (task.risk === 'high') {
    base.push('review_approved');
  }
  return base;
}

export interface ProductGoalGraph extends GoalGraphInput {
  productEnriched: boolean;
  impactPreview?: {
    components: string[];
    requirements: string[];
  };
}

export function planProductGoal(
  objective: string,
  graph?: ProductGraphInput,
): ProductGoalGraph {
  const base = planGoal(objective);
  const enrichedTasks = base.tasks.map((task) => ({
    ...task,
    // Extended fields stored in acceptance_criteria metadata via title suffix for goal yaml compatibility
  }));

  const impactPreview = graph
    ? {
        components: queryNodes(graph, 'component')
          .slice(0, 5)
          .map((n) => n.name),
        requirements: queryNodes(graph, 'requirement')
          .slice(0, 5)
          .map((n) => n.name),
      }
    : undefined;

  return {
    ...base,
    tasks: enrichedTasks,
    productEnriched: !!graph,
    impactPreview,
  };
}

export function enrichGoalWithProduct(
  graph: GoalGraphInput,
  productGraph?: ProductGraphInput,
): GoalGraphInput & {
  enrichedTasks: Array<GoalTaskInput & {
    targetFiles: string[];
    agentType: string;
    evidenceRequired: string[];
  }>;
} {
  const enrichedTasks = graph.tasks.map((task) => ({
    ...task,
    targetFiles: inferTargetFiles(task, productGraph),
    agentType: inferAgentType(task),
    evidenceRequired: inferEvidenceRequired(task),
  }));
  return { ...graph, enrichedTasks };
}

export function scoreTaskPriority(
  task: GoalTaskInput,
  graph?: ProductGraphInput,
): number {
  const riskWeight = task.risk === 'high' ? 3 : task.risk === 'medium' ? 2 : 1;
  const deps = (task.depends_on ?? []).length;
  const componentHits = graph ? inferTargetFiles(task, graph).length : 0;
  return riskWeight * 10 + componentHits * 2 - deps;
}
