import { planGoal } from '../core/goal/goal-planner';
import { writeGoal } from '../core/goal/goal-state';
import type { OutputMode } from '../utils/logger';

export interface GoalOptions {
  readonly objective: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
}

/**
 * Render a dependency tree diagram for human output
 */
function renderDependencyTree(
  tasks: Array<{ id: string; title: string; depends_on?: string[] }>
): string {
  const lines: string[] = [];
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Find root tasks (no dependencies)
  const roots = tasks.filter((t) => !t.depends_on || t.depends_on.length === 0);

  function render(taskId: string, prefix: string, isLast: boolean): void {
    const task = taskMap.get(taskId);
    if (!task) return;

    const connector = isLast ? '└── ' : '├── ';
    const label = `${task.id}: ${task.title}`;
    lines.push(`${prefix}${connector}${label}`);

    // Find tasks that depend on this one
    const children = tasks.filter(
      (t) => t.depends_on && t.depends_on.includes(taskId)
    );

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    children.forEach((child, i) => {
      render(child.id, childPrefix, i === children.length - 1);
    });
  }

  roots.forEach((root, i) => {
    render(root.id, '', i === roots.length - 1);
  });

  return lines.join('\n');
}

/**
 * Goal command — parses objective, plans tasks, writes goal state, renders output
 */
export async function goalCommand(
  options: GoalOptions
): Promise<{ code: number; data?: unknown }> {
  const { objective, projectRoot, output } = options;

  if (!objective || objective.trim().length === 0) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'goal',
        errors: ['Objective is required. Usage: codeconductor goal "<objective>"'],
      },
    };
  }

  try {
    const graph = planGoal(objective);

    const writeResult = await writeGoal(projectRoot, graph);
    if (!writeResult.success) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'goal',
          errors: [`Failed to write goal: ${writeResult.error.message}`],
        },
      };
    }

    if (output === 'json') {
      return {
        code: 0,
        data: {
          success: true,
          command: 'goal',
          objective: graph.objective,
          tasks: graph.tasks,
          file: '.codeconductor/current-goal.yml',
        },
      };
    }

    // Human output: dependency tree
    const tree = renderDependencyTree(graph.tasks);
    const lines = [
      `Objective: ${graph.objective}`,
      '',
      'Task dependency graph:',
      tree,
      '',
      `Tasks: ${graph.tasks.length} total`,
      `File: .codeconductor/current-goal.yml`,
    ];

    return {
      code: 0,
      data: {
        success: true,
        command: 'goal',
        output: lines.join('\n'),
      },
    };
  } catch (e) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'goal',
        errors: [e instanceof Error ? e.message : String(e)],
      },
    };
  }
}
