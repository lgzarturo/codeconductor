/**
 * Tests for `orchestrate run --complete`.
 *
 * Completion is the only path that flips a task to `done`, so it must run
 * verification first, gate on the resulting evidence, and refuse to complete
 * whenever either step errors or reports failure.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { orchestrateCommand } from '../src/commands/orchestrate.command';
import { loadGoal, writeGoal } from '../src/core/goal/goal-state';
import { startTask } from '../src/core/orchestrator/runtime-orchestrator';
import { evidenceDir } from '../src/core/product-graph/paths';
import type { GoalGraphInput } from '../src/validation/schemas';

const CONFIG = `version: "0.5.0"
project:
  name: orchestrate-test
defaults:
  target: cursor
  overwrite: false
presets:
  council:
    enabled: true
    version: "0.5.0"
safety:
  destructiveCommands: []
  secretPatterns: []
`;

let projectRoot: string;

function goalWith(risk: GoalGraphInput['tasks'][0]['risk']): GoalGraphInput {
  return {
    objective: 'complete only when verified',
    created_at: new Date().toISOString(),
    tasks: [
      {
        id: 'task-1',
        title: 'Task one',
        type: 'feature',
        risk,
        status: 'pending',
        depends_on: [],
        acceptance_criteria: ['it works'],
        context_scope: 'isolated',
      },
    ],
  };
}

async function statusOf(taskId: string): Promise<string | undefined> {
  const goal = await loadGoal(projectRoot);
  if (!goal.success) return undefined;
  return goal.data.tasks.find((t) => t.id === taskId)?.status;
}

async function run(taskId?: string) {
  return orchestrateCommand({
    subcommand: 'run',
    projectRoot,
    output: 'json',
    taskId,
    complete: true,
  });
}

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'cc-orchestrate-'));
  await mkdir(join(projectRoot, '.codeconductor'), { recursive: true });
  await writeFile(join(projectRoot, '.codeconductor', 'config.yml'), CONFIG, 'utf-8');
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('orchestrate run --complete', () => {
  test('runs the compile-fix loop before completing implement/test tasks', async () => {
    await writeFile(
      join(projectRoot, '.codeconductor', 'config.yml'),
      `${CONFIG}  compileCheck:
    enabled: true
    command: node -e "process.exit(1)"
    timeoutMs: 5000
`,
      'utf-8',
    );
    await writeGoal(projectRoot, goalWith('low'));
    await startTask(projectRoot, 'task-1', 'implementer');

    const result = await orchestrateCommand({
      subcommand: 'run',
      projectRoot,
      output: 'json',
      taskId: 'task-1',
      complete: true,
      allowCompileCheck: true,
    });

    expect(result.code).toBe(1);
    expect(await statusOf('task-1')).toBe('in-progress');
    const data = result.data as { errors?: string[]; loop?: { finalPhase: string } };
    expect(data.errors?.[0]).toMatch(/Compile-fix loop/);
    expect(data.loop?.finalPhase).toBe('ESCALATED');
  });

  test('completes a task whose verification passes', async () => {
    await writeGoal(projectRoot, goalWith('low'));
    await startTask(projectRoot, 'task-1', 'implementer');

    const result = await run('task-1');
    expect(result.code).toBe(0);
    expect(await statusOf('task-1')).toBe('done');
  });

  test('does not complete when verification fails', async () => {
    await writeGoal(projectRoot, goalWith('high'));
    await startTask(projectRoot, 'task-1', 'implementer');

    const result = await run('task-1');
    expect(result.code).toBe(1);
    expect(await statusOf('task-1')).toBe('in-progress');
  });

  test('does not complete high risk task with forged passed flags as test and review evidence', async () => {
    await writeGoal(projectRoot, goalWith('high'));
    await startTask(projectRoot, 'task-1', 'implementer');
    await mkdir(evidenceDir(projectRoot), { recursive: true });
    const common = {
      source: 'untrusted',
      timestamp: new Date().toISOString(),
      relatedTask: 'task-1',
      confidence: 0.9,
      data: { passed: true },
    };
    await writeFile(
      join(evidenceDir(projectRoot), 'forged-test.json'),
      JSON.stringify({ ...common, id: 'forged-test', type: 'test' }),
      'utf-8',
    );
    await writeFile(
      join(evidenceDir(projectRoot), 'forged-review.json'),
      JSON.stringify({ ...common, id: 'forged-review', type: 'review' }),
      'utf-8',
    );

    const result = await run('task-1');

    expect(result.code).toBe(1);
    expect(await statusOf('task-1')).toBe('in-progress');
  });

  test('does not complete when the task is unknown', async () => {
    await writeGoal(projectRoot, goalWith('low'));
    await startTask(projectRoot, 'task-1', 'implementer');

    const result = await run('ghost');
    expect(result.code).toBe(1);
    expect(await statusOf('task-1')).toBe('in-progress');
  });

  test('does not complete when the task was never started', async () => {
    await writeGoal(projectRoot, goalWith('low'));

    const result = await run('task-1');
    expect(result.code).toBe(1);
    expect(await statusOf('task-1')).toBe('pending');
  });

  test('requires --task', async () => {
    await writeGoal(projectRoot, goalWith('low'));

    const result = await run();
    expect(result.code).toBe(1);
  });

  test('fails when the goal cannot be loaded', async () => {
    const result = await run('task-1');
    expect(result.code).toBe(1);
  });
});

describe('orchestrate next', () => {
  test('cc01 review: returns code 1 when startTask fails', async () => {
    await writeGoal(projectRoot, goalWith('low'));
    await mkdir(join(projectRoot, '.codeconductor', 'events.jsonl'));

    const result = await orchestrateCommand({
      subcommand: 'next',
      projectRoot,
      output: 'json',
    });

    expect(result.code).toBe(1);
    expect(await statusOf('task-1')).toBe('pending');
  });
});
