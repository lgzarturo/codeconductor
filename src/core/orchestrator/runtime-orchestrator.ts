import type {
  CanonicalTaskCardInput,
  GoalGraphInput,
  GoalTaskInput,
  OperationalStateInput,
  ProductGraphInput,
} from '../../validation/schemas';
import { enrichGoalWithProduct, inferEvidenceRequired } from '../planner/product-planner';
import { loadGoal, writeGoal } from '../goal/goal-state';
import { loadGraph } from '../product-graph/graph-store';
import { appendEvent } from '../memory/episodic-store';
import {
  clearActiveTask,
  loadOperationalState,
  saveOperationalState,
  setActiveTask,
} from '../memory/operational-state';
import {
  gateTaskCompletion,
  validateEvidenceIds,
} from '../verification/verification-runner';
import { err, ok, type Result } from '../../utils/result';
import type { CommandEnvelopeInput } from '../../validation/schemas';

/**
 * Undo a task status change and restore the operational state captured before
 * it. Used when a later step fails, so a task is never left half-transitioned.
 * The original failure is returned, annotated when the undo itself fails.
 */
async function rollbackTaskStatus(
  projectRoot: string,
  graph: GoalGraphInput,
  task: GoalTaskInput,
  previousStatus: GoalTaskInput['status'],
  previousState: OperationalStateInput,
  cause: Error,
): Promise<Result<never, Error>> {
  task.status = previousStatus;
  const write = await writeGoal(projectRoot, graph);
  const restored = write.success ? await saveOperationalState(projectRoot, previousState) : write;

  return restored.success
    ? err(cause)
    : err(new Error(`${cause.message} (rollback failed: ${restored.error.message})`));
}

export function getReadyTasks(graph: GoalGraphInput): GoalTaskInput[] {
  const done = new Set(graph.tasks.filter((t) => t.status === 'done').map((t) => t.id));
  const blocked = new Set(graph.tasks.filter((t) => t.status === 'blocked').map((t) => t.id));

  return graph.tasks.filter((task) => {
    if (task.status !== 'pending') return false;
    if (blocked.has(task.id)) return false;
    const deps = task.depends_on ?? [];
    return deps.every((d) => done.has(d));
  });
}

export function goalTaskToCanonicalCard(
  task: GoalTaskInput & {
    targetFiles?: string[];
    agentType?: string;
    evidenceRequired?: string[];
  },
  objective: string,
): CanonicalTaskCardInput {
  return {
    id: task.id,
    title: task.title,
    objective,
    context: `Task from goal graph: ${task.title}`,
    acceptanceCriteria: task.acceptance_criteria,
    dependencies: task.depends_on ?? [],
    constraints: [],
    risk: task.risk,
    targetFiles: task.targetFiles ?? [],
    agentType: task.agentType ?? 'implementer',
    evidenceRequired: task.evidenceRequired ?? ['acceptance_criteria_met'],
    status: task.status === 'in-progress' ? 'in-progress' : task.status === 'done' ? 'done' : task.status === 'blocked' ? 'blocked' : 'ready',
    type: task.type,
    linkedCapabilities: [],
  };
}

export function buildTaskEnvelope(
  card: CanonicalTaskCardInput,
  projectRoot: string,
  projectName: string,
): CommandEnvelopeInput {
  const command =
    card.type === 'fix'
      ? 'fix'
      : card.type === 'refactor'
        ? 'refactor'
        : card.type === 'test'
          ? 'test-plan'
          : 'feature';

  return {
    protocolVersion: 'ccep-1',
    command,
    userRequest: `${card.title}: ${card.objective}`,
    projectId: projectName,
    repoContext: {
      stack: [],
      existingModules: card.targetFiles,
      domain: card.agentType,
    },
    constraints: {
      outputFormat: 'taskcard',
      needConfirmation: card.risk === 'high',
      riskThreshold: card.risk,
    },
    executionPolicy: {
      modelMode: 'structured',
      maxVariance: 'low',
    },
  };
}

export interface OrchestratorNextResult {
  task: CanonicalTaskCardInput;
  envelope: CommandEnvelopeInput;
  readyCount: number;
}

export async function getNextTask(
  projectRoot: string,
  projectName: string,
): Promise<Result<OrchestratorNextResult, Error>> {
  const goalResult = await loadGoal(projectRoot);
  if (!goalResult.success) return goalResult;

  const graphResult = await loadGraph(projectRoot);
  const productGraph = graphResult.success ? graphResult.data : undefined;

  const enriched = enrichGoalWithProduct(goalResult.data, productGraph);
  const ready = getReadyTasks(enriched);

  if (ready.length === 0) {
    return err(new Error('No ready tasks. All pending tasks have unmet dependencies or are blocked.'));
  }

  const task = ready[0]!;
  const enrichedTask = enriched.enrichedTasks.find((t) => t.id === task.id)!;
  const card = goalTaskToCanonicalCard(enrichedTask, enriched.objective);
  const envelope = buildTaskEnvelope(card, projectRoot, projectName);

  return ok({
    task: card,
    envelope,
    readyCount: ready.length,
  });
}

export async function startTask(
  projectRoot: string,
  taskId: string,
  agent?: string,
): Promise<Result<void, Error>> {
  const goalResult = await loadGoal(projectRoot);
  if (!goalResult.success) return goalResult;

  const task = goalResult.data.tasks.find((t) => t.id === taskId);
  if (!task) return err(new Error(`Task ${taskId} not found`));
  if (task.status !== 'pending') {
    return err(new Error(`Task ${taskId} is ${task.status}, expected pending`));
  }

  const stateBefore = await loadOperationalState(projectRoot);
  if (!stateBefore.success) return stateBefore;
  const previousState = stateBefore.data;
  const previousStatus = task.status;

  task.status = 'in-progress';
  const write = await writeGoal(projectRoot, goalResult.data);
  if (!write.success) return write;

  const active = await setActiveTask(projectRoot, taskId, agent);
  if (!active.success) {
    return rollbackTaskStatus(
      projectRoot,
      goalResult.data,
      task,
      previousStatus,
      previousState,
      active.error,
    );
  }

  const event = await appendEvent(projectRoot, {
    type: 'task.started',
    timestamp: new Date().toISOString(),
    payload: { taskId, agent },
  });
  if (!event.success) {
    return rollbackTaskStatus(
      projectRoot,
      goalResult.data,
      task,
      previousStatus,
      previousState,
      event.error,
    );
  }

  return ok(undefined);
}

export async function completeTask(
  projectRoot: string,
  taskId: string,
  evidenceIds?: string[],
): Promise<Result<void, Error>> {
  const goalResult = await loadGoal(projectRoot);
  if (!goalResult.success) return goalResult;

  const task = goalResult.data.tasks.find((t) => t.id === taskId);
  if (!task) return err(new Error(`Task ${taskId} not found`));
  if (task.status !== 'in-progress') {
    return err(new Error(`Task ${taskId} is ${task.status}, expected in-progress`));
  }

  const done = new Set(goalResult.data.tasks.filter((t) => t.status === 'done').map((t) => t.id));
  const unmet = (task.depends_on ?? []).filter((d) => !done.has(d));
  if (unmet.length > 0) {
    return err(new Error(`Task ${taskId} has unmet dependencies: ${unmet.join(', ')}`));
  }

  const activeState = await loadOperationalState(projectRoot);
  if (!activeState.success) return activeState;
  if (!activeState.data.activeTaskIds.includes(taskId)) {
    return err(new Error(`Task ${taskId} is not active. Start it before completing it.`));
  }

  if (!evidenceIds || evidenceIds.length === 0) {
    return err(new Error(`Task ${taskId} cannot be completed without verification evidence`));
  }

  const evidence = await validateEvidenceIds(projectRoot, taskId, evidenceIds);
  if (!evidence.success) return evidence;

  const gate = await gateTaskCompletion(
    projectRoot,
    taskId,
    inferEvidenceRequired(task),
    evidenceIds,
  );
  if (!gate.success) return gate;
  if (!gate.data) {
    return err(new Error(`Task ${taskId} does not satisfy its completion evidence requirements`));
  }

  const previousState = activeState.data;
  const previousStatus = task.status;

  task.status = 'done';
  const write = await writeGoal(projectRoot, goalResult.data);
  if (!write.success) return write;

  const cleared = await clearActiveTask(projectRoot, taskId);
  if (!cleared.success) {
    return rollbackTaskStatus(
      projectRoot,
      goalResult.data,
      task,
      previousStatus,
      previousState,
      cleared.error,
    );
  }

  const event = await appendEvent(projectRoot, {
    type: 'task.completed',
    timestamp: new Date().toISOString(),
    payload: { taskId, evidenceIds },
  });
  if (!event.success) {
    return rollbackTaskStatus(
      projectRoot,
      goalResult.data,
      task,
      previousStatus,
      previousState,
      event.error,
    );
  }

  return ok(undefined);
}

export function formatGoalStatus(graph: GoalGraphInput): string {
  const lines: string[] = [`Objective: ${graph.objective}`, ''];
  for (const task of graph.tasks) {
    const icon =
      task.status === 'done'
        ? '✓'
        : task.status === 'blocked'
          ? '✗'
          : task.status === 'in-progress'
            ? '→'
            : '○';
    const deps = task.depends_on?.length ? ` (deps: ${task.depends_on.join(', ')})` : '';
    lines.push(`${icon} [${task.status}] ${task.id}: ${task.title}${deps}`);
  }
  return lines.join('\n');
}
