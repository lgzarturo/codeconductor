import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { GoalGraphSchema, type GoalGraphInput } from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import { withQueueLock } from '../queue/lock';

const GOAL_FILE = '.codeconductor/current-goal.yml';

export function propagateBlockedTasks(graph: GoalGraphInput): boolean {
  const blocked = new Set(graph.tasks.filter((task) => task.status === 'blocked').map((task) => task.id));
  let changed = false;
  let progressed: boolean;
  do {
    progressed = false;
    for (const task of graph.tasks) {
      if (task.status !== 'pending') continue;
      const dependency = (task.depends_on ?? []).find((id) => blocked.has(id));
      if (!dependency) continue;
      task.status = 'blocked';
      task.blocked_reason = `Blocked by dependency "${dependency}"`;
      blocked.add(task.id);
      progressed = true;
      changed = true;
    }
  } while (progressed);
  return changed;
}

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
  const path: string[] = [];
  let cycle: string[] = [];
  const tasksById = new Map(graph.tasks.map((task) => [task.id, task]));

  function dfs(taskId: string): boolean {
    if (inStack.has(taskId)) {
      cycle = [...path.slice(path.indexOf(taskId)), taskId];
      return true;
    }
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    inStack.add(taskId);
    path.push(taskId);

    const task = tasksById.get(taskId);
    if (task) {
      for (const dep of task.depends_on ?? []) {
        if (dfs(dep)) return true;
      }
    }

    inStack.delete(taskId);
    path.pop();
    return false;
  }

  for (const task of graph.tasks) {
    if (dfs(task.id)) {
      return err(new Error(`Cycle detected: ${cycle.join(' -> ')}`));
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
  return withQueueLock(projectRoot, () => writeGoalUnlocked(projectRoot, graph));
}

async function writeGoalUnlocked(
  projectRoot: string,
  graph: GoalGraphInput,
): Promise<Result<void, Error>> {
  const validation = validateGoalGraph(graph);
  if (!validation.success) return validation;

  const dir = resolve(projectRoot, '.codeconductor');
  const temporary = resolve(dir, `current-goal.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(temporary, stringify(graph), { encoding: 'utf-8', flag: 'wx' });
    await rename(temporary, resolve(dir, 'current-goal.yml'));
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  } finally {
    await unlink(temporary).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
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
    return validateGoalGraph(validated);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Mark a task as blocked in the goal graph.
 * Loads the graph, finds the task by ID, sets status to 'blocked', and writes back.
 */
export async function markTaskBlocked(
  projectRoot: string,
  taskId: string,
  reason: string,
): Promise<Result<void, Error>> {
  return withQueueLock(projectRoot, () => markTaskBlockedUnlocked(projectRoot, taskId, reason));
}

async function markTaskBlockedUnlocked(
  projectRoot: string,
  taskId: string,
  reason: string,
): Promise<Result<void, Error>> {
  const loadResult = await loadGoal(projectRoot);
  if (!loadResult.success) return loadResult;

  const graph = loadResult.data;
  const task = graph.tasks.find((t) => t.id === taskId);
  if (!task) {
    return err(new Error(`Task "${taskId}" not found in goal graph`));
  }

  task.status = 'blocked';
  task.blocked_reason = reason;
  propagateBlockedTasks(graph);
  return writeGoal(projectRoot, graph);
}

/** Consecutive failures before the breaker trips and freezes the task. */
export const BREAKER_TRIP_THRESHOLD = 3;

export interface StrikeResult {
  readonly taskId: string;
  readonly failures: number;
  readonly tripped: boolean;
}

/**
 * Record one failure strike. The breaker trips on the third consecutive
 * strike: the task is blocked and frozen with an escalation reason, and
 * dependents propagate to blocked. Strikes on frozen tasks are idempotent;
 * strikes on done tasks are rejected. Counter resets only via unfreezeTask.
 */
export async function recordTaskStrike(
  projectRoot: string,
  taskId: string,
  reason: string,
): Promise<Result<StrikeResult, Error>> {
  return withQueueLock(projectRoot, () => recordTaskStrikeUnlocked(projectRoot, taskId, reason));
}

async function recordTaskStrikeUnlocked(
  projectRoot: string,
  taskId: string,
  reason: string,
): Promise<Result<StrikeResult, Error>> {
  const loadResult = await loadGoal(projectRoot);
  if (!loadResult.success) return loadResult;

  const graph = loadResult.data;
  const task = graph.tasks.find((t) => t.id === taskId);
  if (!task) {
    return err(new Error(`Task "${taskId}" not found in goal graph`));
  }
  if (task.status === 'done') {
    return err(new Error(`Task "${taskId}" is done and cannot accrue failures`));
  }

  const failures = (task.consecutive_failures ?? 0) + 1;
  task.consecutive_failures = failures;
  const tripped = failures >= BREAKER_TRIP_THRESHOLD || task.frozen === true;

  if (tripped) {
    task.consecutive_failures = Math.min(failures, BREAKER_TRIP_THRESHOLD);
    if (task.frozen !== true) {
      task.status = 'blocked';
      task.frozen = true;
      task.blocked_reason =
        `Circuit breaker tripped after ${BREAKER_TRIP_THRESHOLD} consecutive failures ` +
        `(last: ${reason}). Escalate to debug agent or /cc-help.`;
      propagateBlockedTasks(graph);
    }
    const write = await writeGoal(projectRoot, graph);
    if (!write.success) return write;
    return ok({ taskId, failures: task.consecutive_failures, tripped: true });
  }

  const write = await writeGoal(projectRoot, graph);
  if (!write.success) return write;
  return ok({ taskId, failures, tripped: false });
}

/**
 * Recovery counterpart: clear the breaker trip and re-queue the task.
 */
export async function unfreezeTask(
  projectRoot: string,
  taskId: string,
): Promise<Result<void, Error>> {
  return withQueueLock(projectRoot, () => unfreezeTaskUnlocked(projectRoot, taskId));
}

async function unfreezeTaskUnlocked(
  projectRoot: string,
  taskId: string,
): Promise<Result<void, Error>> {
  const loadResult = await loadGoal(projectRoot);
  if (!loadResult.success) return loadResult;

  const graph = loadResult.data;
  const task = graph.tasks.find((t) => t.id === taskId);
  if (!task) {
    return err(new Error(`Task "${taskId}" not found in goal graph`));
  }

  task.status = 'pending';
  task.consecutive_failures = 0;
  task.frozen = false;
  task.blocked_reason = undefined;
  return writeGoal(projectRoot, graph);
}
