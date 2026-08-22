import { loadConfig } from '../core/config/config-loader';
import { runIngest } from '../core/knowledge/ingest-pipeline';
import {
  completeTask,
  formatGoalStatus,
  getNextTask,
  startTask,
} from '../core/orchestrator/runtime-orchestrator';
import { loadGoal } from '../core/goal/goal-state';
import { runVerification, gateTaskCompletion } from '../core/verification/verification-runner';
import { runFeedbackLoop } from '../core/feedback/feedback-ingestor';
import { goalTaskToCanonicalCard } from '../core/orchestrator/runtime-orchestrator';
import { enrichGoalWithProduct } from '../core/planner/product-planner';
import { loadGraph } from '../core/product-graph/graph-store';
import type { OutputMode } from '../utils/logger';

export interface OrchestrateOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly taskId?: string;
  readonly complete?: boolean;
}

export async function orchestrateCommand(
  options: OrchestrateOptions,
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, projectRoot, output, taskId, complete } = options;

  try {
    switch (subcommand) {
      case 'status':
        return await handleStatus(projectRoot, output);
      case 'next':
        return await handleNext(projectRoot, output);
      case 'run':
        return await handleRun(projectRoot, output, taskId, complete);
      case 'cycle':
        return await handleCycle(projectRoot, output);
      default:
        return {
          code: 1,
          data: {
            success: false,
            command: 'orchestrate',
            errors: ['Usage: orchestrate status|next|run|cycle'],
          },
        };
    }
  } catch (e) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'orchestrate',
        errors: [e instanceof Error ? e.message : String(e)],
      },
    };
  }
}

async function getProjectName(projectRoot: string): Promise<string> {
  const config = await loadConfig(projectRoot);
  return config.success ? config.data.project.name : 'project';
}

async function handleStatus(
  projectRoot: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const goal = await loadGoal(projectRoot);
  if (!goal.success) {
    return { code: 1, data: { success: false, command: 'orchestrate', errors: [goal.error.message] } };
  }
  const text = formatGoalStatus(goal.data);
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'orchestrate status', tasks: goal.data.tasks } };
  }
  return { code: 0, data: { success: true, command: 'orchestrate status', output: text } };
}

async function handleNext(
  projectRoot: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const projectName = await getProjectName(projectRoot);
  const next = await getNextTask(projectRoot, projectName);
  if (!next.success) {
    return { code: 1, data: { success: false, command: 'orchestrate', errors: [next.error.message] } };
  }

  const started = await startTask(projectRoot, next.data.task.id, next.data.task.agentType);
  if (!started.success) {
    return { code: 1, data: { success: false, command: 'orchestrate', errors: [started.error.message] } };
  }

  if (output === 'json') {
    return {
      code: 0,
      data: {
        success: true,
        command: 'orchestrate next',
        task: next.data.task,
        envelope: next.data.envelope,
        readyCount: next.data.readyCount,
      },
    };
  }

  const lines = [
    `Next task: ${next.data.task.id} — ${next.data.task.title}`,
    `Agent: ${next.data.task.agentType}`,
    `Target files: ${next.data.task.targetFiles.join(', ') || 'none inferred'}`,
    `Ready tasks: ${next.data.readyCount}`,
    '',
    'CCEP envelope (JSON):',
    JSON.stringify(next.data.envelope, null, 2),
  ];

  return { code: 0, data: { success: true, command: 'orchestrate next', output: lines.join('\n') } };
}

async function handleRun(
  projectRoot: string,
  output: OutputMode,
  taskId?: string,
  complete?: boolean,
): Promise<{ code: number; data?: unknown }> {
  if (!complete) {
    return handleNext(projectRoot, output);
  }

  if (!taskId) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'orchestrate',
        errors: ['--complete requires --task <id>'],
      },
    };
  }

  const goal = await loadGoal(projectRoot);
  if (!goal.success) {
    return { code: 1, data: { success: false, command: 'orchestrate', errors: [goal.error.message] } };
  }

  const graph = await loadGraph(projectRoot);
  const enriched = enrichGoalWithProduct(goal.data, graph.success ? graph.data : undefined);
  const enrichedTask = enriched.enrichedTasks.find((t) => t.id === taskId);
  if (!enrichedTask) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'orchestrate',
        errors: [`Task ${taskId} not found in goal`],
      },
    };
  }
  const card = goalTaskToCanonicalCard(enrichedTask, enriched.objective);

  const verify = await runVerification(projectRoot, taskId, goal.data);
  if (!verify.success) {
    return { code: 1, data: { success: false, command: 'orchestrate', errors: [verify.error.message] } };
  }
  if (!verify.data.passed) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'orchestrate',
        errors: ['Verification failed. Run `cc verify --task ' + taskId + '`'],
      },
    };
  }

  const gate = await gateTaskCompletion(projectRoot, taskId, card.evidenceRequired);
  if (!gate.success) {
    return { code: 1, data: { success: false, command: 'orchestrate', errors: [gate.error.message] } };
  }
  if (!gate.data) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'orchestrate',
        errors: [`Completion gate blocked: missing evidence (${card.evidenceRequired.join(', ')})`],
      },
    };
  }

  const result = await completeTask(projectRoot, taskId, verify.data.evidenceIds);
  if (!result.success) {
    return { code: 1, data: { success: false, command: 'orchestrate', errors: [result.error.message] } };
  }

  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'orchestrate run', taskId, status: 'done' } };
  }
  return {
    code: 0,
    data: { success: true, command: 'orchestrate run', output: `Task ${taskId} marked done` },
  };
}

async function handleCycle(
  projectRoot: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const config = await loadConfig(projectRoot);
  const productName = config.success ? config.data.project.name : 'project';

  await runIngest(projectRoot, productName);
  const insights = await runFeedbackLoop(projectRoot);
  const next = await getNextTask(projectRoot, productName);

  const data = {
    ingest: 'completed',
    insights: insights.length,
    nextTask: next.success ? next.data.task.id : null,
  };

  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'orchestrate cycle', ...data } };
  }

  const lines = [
    'Orchestrate cycle:',
    '  1. Ingest — completed',
    `  2. Feedback — ${insights.length} insights`,
    next.success
      ? `  3. Next task — ${next.data.task.id}: ${next.data.task.title}`
      : '  3. Next task — none ready',
  ];

  return { code: 0, data: { success: true, command: 'orchestrate cycle', output: lines.join('\n') } };
}
