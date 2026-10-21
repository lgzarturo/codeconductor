import { planGoal } from '../core/goal/goal-planner';
import { planProductGoal, enrichGoalWithProduct } from '../core/planner/product-planner';
import { loadGraph } from '../core/product-graph/graph-store';
import { writeGoal } from '../core/goal/goal-state';
import {
  buildTrackerReport,
  formatTrackerMarkdown,
  watchTracker,
  writeTrackerFile,
} from '../core/goal/goal-tracker';
import type { OutputMode } from '../utils/logger';

export interface GoalOptions {
  readonly objective: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly product?: boolean;
  readonly dryRun?: boolean;
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
  const { objective, projectRoot, output, product, dryRun } = options;

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
    let graph;
    let impactPreview: string | undefined;

    if (product) {
      const pg = await loadGraph(projectRoot);
      const productGraph = pg.success ? pg.data : undefined;
      const planned = planProductGoal(objective, productGraph);
      graph = { objective: planned.objective, tasks: planned.tasks, created_at: planned.created_at };
      if (planned.impactPreview) {
        impactPreview = `Components: ${planned.impactPreview.components.join(', ') || 'none'}`;
      }
    } else {
      graph = planGoal(objective);
    }

    if (dryRun) {
      const pg = product ? await loadGraph(projectRoot) : null;
      const productGraph = pg?.success ? pg.data : undefined;
      const enriched = product ? enrichGoalWithProduct(graph, productGraph) : null;
      return {
        code: 0,
        data: {
          success: true,
          command: 'goal',
          dryRun: true,
          objective: graph.objective,
          tasks: graph.tasks,
          enriched: enriched?.enrichedTasks,
          impactPreview,
        },
      };
    }

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
    if (impactPreview) {
      lines.push('', 'Impact preview:', impactPreview);
    }

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

export interface TrackerOptions {
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly watch?: boolean;
  readonly intervalMs?: string;
  readonly rounds?: string;
}

/**
 * Goal tracker — completion report plus goal-tracker.md artifact.
 */
export async function trackerCommand(
  options: TrackerOptions,
): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output } = options;

  if (options.watch === true) {
    return watchTrackerCommand(options);
  }

  const report = await buildTrackerReport(projectRoot);
  if (!report.success) {
    return {
      code: 1,
      data: { success: false, command: 'goal tracker', errors: [report.error.message] },
    };
  }

  const written = await writeTrackerFile(projectRoot, report.data);
  if (!written.success) {
    return {
      code: 1,
      data: { success: false, command: 'goal tracker', errors: [written.error.message] },
    };
  }

  if (output === 'json') {
    return {
      code: 0,
      data: { success: true, command: 'goal tracker', report: report.data, path: written.data.path },
    };
  }
  return {
    code: 0,
    data: { success: true, command: 'goal tracker', output: formatTrackerMarkdown(report.data) },
  };
}

function parseWatchPositiveInt(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer, got '${raw}'`);
  }
  return value;
}

async function watchTrackerCommand(
  options: TrackerOptions,
): Promise<{ code: number; data?: unknown }> {
  const fail = (errors: string[]) => ({
    code: 1,
    data: { success: false, command: 'goal tracker', errors },
  });

  let intervalMs: number | undefined;
  let rounds: number | undefined;
  try {
    intervalMs = parseWatchPositiveInt(options.intervalMs, '--interval-ms');
    rounds = parseWatchPositiveInt(options.rounds, '--rounds');
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)]);
  }

  const stdin = process.stdin;
  const interactive = stdin.isTTY === true && typeof stdin.setRawMode === 'function';
  if (!interactive && rounds === undefined) {
    return fail(['watch mode needs a TTY (q to quit) or --rounds <n>']);
  }

  let cancelled = false;
  const onData = (chunk: Buffer | string): void => {
    const key = chunk.toString();
    if (key === 'q' || key === 'Q' || key === '\x03' || key === '\x1b') cancelled = true;
  };
  if (interactive) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  }
  try {
    const result = await watchTracker(options.projectRoot, {
      intervalMs,
      rounds,
      clear: process.stdout.isTTY === true,
      isCancelled: () => cancelled,
    });
    return { code: 0, data: { success: true, command: 'goal tracker', rounds: result.rounds } };
  } finally {
    if (interactive) {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    }
  }
}
