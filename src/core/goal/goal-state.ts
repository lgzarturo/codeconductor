import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { GoalGraphSchema, type GoalGraphInput } from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';

const GOAL_FILE = '.codeconductor/current-goal.yml';

/**
 * Validate that all depends_on references are valid and no cycles exist
 */
function validateGoalGraph(graph: GoalGraphInput): Result<GoalGraphInput, Error> {
  const ids = new Set(graph.tasks.map((t) => t.id));

  // Check unique IDs
  if (ids.size !== graph.tasks.length) {
    return err(new Error('Duplicate task IDs in goal graph'));
  }

  // Check all depends_on references are valid
  for (const task of graph.tasks) {
    for (const dep of task.depends_on ?? []) {
      if (!ids.has(dep)) {
        return err(new Error(`Task "${task.id}" depends on unknown task "${dep}"`));
      }
    }
  }

  // Check for cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(taskId: string): boolean {
    if (inStack.has(taskId)) return true; // cycle found
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    inStack.add(taskId);

    const task = graph.tasks.find((t) => t.id === taskId);
    if (task) {
      for (const dep of task.depends_on ?? []) {
        if (dfs(dep)) return true;
      }
    }

    inStack.delete(taskId);
    return false;
  }

  for (const task of graph.tasks) {
    if (dfs(task.id)) {
      return err(new Error(`Cycle detected involving task "${task.id}"`));
    }
  }

  return ok(graph);
}

/**
 * Write a goal graph to .codeconductor/current-goal.yml
 */
export async function writeGoal(
  projectRoot: string,
  graph: GoalGraphInput
): Promise<Result<void, Error>> {
  const validation = validateGoalGraph(graph);
  if (!validation.success) return validation;

  const dir = resolve(projectRoot, '.codeconductor');
  await mkdir(dir, { recursive: true });
  const yaml = stringify(graph);
  await writeFile(resolve(dir, 'current-goal.yml'), yaml, 'utf-8');
  return ok(undefined);
}

/**
 * Load and validate a goal graph from .codeconductor/current-goal.yml
 */
export async function loadGoal(
  projectRoot: string
): Promise<Result<GoalGraphInput, Error>> {
  try {
    const filePath = resolve(projectRoot, GOAL_FILE);
    const content = await readFile(filePath, 'utf-8');
    const data = parse(content);
    const validated = GoalGraphSchema.parse(data);
    return ok(validated);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
