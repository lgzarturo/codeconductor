import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { parseArgs, routeCommand } from '../src/cli/router';
import {
  loadGoal,
  recordTaskStrike,
  unfreezeTask,
  writeGoal,
} from '../src/core/goal/goal-state';
import type { GoalGraphInput } from '../src/validation/schemas';

function makeGraph(): GoalGraphInput {
  return {
    objective: 'ship it',
    created_at: new Date().toISOString(),
    tasks: [
      {
        id: 't1',
        title: 'worker',
        type: 'feature',
        risk: 'medium',
        status: 'in-progress',
        depends_on: [],
        acceptance_criteria: ['done'],
      },
      {
        id: 't2',
        title: 'dependent',
        type: 'feature',
        risk: 'low',
        status: 'pending',
        depends_on: ['t1'],
        acceptance_criteria: ['done'],
      },
    ],
  };
}

describe('goal circuit breaker', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-breaker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
    const written = await writeGoal(dir, makeGraph());
    expect(written.success).toBe(true);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('strikes 1-2 count without changing status', async () => {
    const first = await recordTaskStrike(dir, 't1', 'boom 1');
    expect(first.success && first.data).toMatchObject({ failures: 1, tripped: false });
    const second = await recordTaskStrike(dir, 't1', 'boom 2');
    expect(second.success && second.data).toMatchObject({ failures: 2, tripped: false });
    const goal = await loadGoal(dir);
    expect(goal.success && goal.data.tasks.find((t) => t.id === 't1')?.status).toBe('in-progress');
  });

  test('strike 3 trips: blocked, frozen, escalation reason', async () => {
    await recordTaskStrike(dir, 't1', 'boom 1');
    await recordTaskStrike(dir, 't1', 'boom 2');
    const third = await recordTaskStrike(dir, 't1', 'boom 3');
    expect(third.success && third.data).toMatchObject({ failures: 3, tripped: true });
    const goal = await loadGoal(dir);
    const task = goal.success && goal.data.tasks.find((t) => t.id === 't1');
    expect(task).toMatchObject({ status: 'blocked', frozen: true });
    expect(task && task.blocked_reason ? task.blocked_reason : '').toMatch(/circuit breaker/i);
    expect(task && task.blocked_reason ? task.blocked_reason : '').toMatch(/debug/);
  });

  test('trip propagates blocked to dependents without freezing them', async () => {
    await recordTaskStrike(dir, 't1', 'b1');
    await recordTaskStrike(dir, 't1', 'b2');
    await recordTaskStrike(dir, 't1', 'b3');
    const goal = await loadGoal(dir);
    const dep = goal.success && goal.data.tasks.find((t) => t.id === 't2');
    expect(dep).toMatchObject({ status: 'blocked' });
    expect(dep && dep.frozen).toBeUndefined();
  });

  test('strikes on a frozen task are idempotent', async () => {
    await recordTaskStrike(dir, 't1', 'b1');
    await recordTaskStrike(dir, 't1', 'b2');
    await recordTaskStrike(dir, 't1', 'b3');
    const again = await recordTaskStrike(dir, 't1', 'b4');
    expect(again.success && again.data).toMatchObject({ failures: 3, tripped: true });
  });

  test('strike on a done task errors', async () => {
    const graph = makeGraph();
    graph.tasks[0]!.status = 'done';
    await writeGoal(dir, graph);
    const result = await recordTaskStrike(dir, 't1', 'boom');
    expect(result.success).toBe(false);
  });

  test('strike on a missing task errors', async () => {
    const result = await recordTaskStrike(dir, 'nope', 'boom');
    expect(result.success).toBe(false);
  });

  test('unfreeze re-queues the task with a clean counter', async () => {
    await recordTaskStrike(dir, 't1', 'b1');
    await recordTaskStrike(dir, 't1', 'b2');
    await recordTaskStrike(dir, 't1', 'b3');
    const result = await unfreezeTask(dir, 't1');
    expect(result.success).toBe(true);
    const goal = await loadGoal(dir);
    const task = goal.success && goal.data.tasks.find((t) => t.id === 't1');
    expect(task).toMatchObject({ status: 'pending', consecutive_failures: 0, frozen: false });
    expect(task && task.blocked_reason).toBeUndefined();
  });

  test('graphs written before the breaker fields still accept strikes', async () => {
    const legacy = {
      objective: 'legacy',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 'old',
          title: 'old task',
          type: 'fix',
          risk: 'low',
          status: 'in-progress',
          depends_on: [],
          acceptance_criteria: ['done'],
        },
      ],
    };
    await mkdir(join(dir, '.codeconductor'), { recursive: true });
    await writeFile(join(dir, '.codeconductor', 'current-goal.yml'), stringify(legacy));
    const result = await recordTaskStrike(dir, 'old', 'boom');
    expect(result.success && result.data).toMatchObject({ failures: 1, tripped: false });
  });

  test('orchestrate run --failed records strikes and reports the trip', async () => {
    const route = (extra: string[]) =>
      routeCommand(parseArgs(['orchestrate', 'run', '--task', 't1', '--output=json', ...extra]), dir);
    const first = await route(['--failed', '--reason', 'red']);
    expect(first.code).toBe(0);
    expect(first.data).toMatchObject({ failures: 1, tripped: false });
    await route(['--failed', '--reason', 'red']);
    const third = await route(['--failed', '--reason', 'red']);
    expect(third.code).toBe(0);
    expect(third.data).toMatchObject({ failures: 3, tripped: true });
    const human = await routeCommand(
      parseArgs(['orchestrate', 'run', '--task', 't1', '--failed', '--reason', 'red']),
      dir,
    );
    expect(human.code).toBe(0);
    expect((human.data as { output: string }).output).toMatch(/TRIPPED/);
  });

  test('orchestrate run rejects --complete together with --failed', async () => {
    const result = await routeCommand(
      parseArgs(['orchestrate', 'run', '--task', 't1', '--complete', '--failed']),
      dir,
    );
    expect(result.code).toBe(1);
  });
});
