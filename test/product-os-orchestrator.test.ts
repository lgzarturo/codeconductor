import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  completeTask,
  getReadyTasks,
  startTask,
} from '../src/core/orchestrator/runtime-orchestrator';
import { loadGoal, writeGoal } from '../src/core/goal/goal-state';
import { loadOperationalState, setActiveTask } from '../src/core/memory/operational-state';
import { evidenceDir } from '../src/core/product-graph/paths';
import type { GoalGraphInput } from '../src/validation/schemas';

describe('Orchestrator runtime', () => {
  test('getReadyTasks respects dependencies', () => {
    const graph: GoalGraphInput = {
      objective: 'test',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 'a',
          title: 'First',
          type: 'feature',
          risk: 'low',
          status: 'done',
          depends_on: [],
          acceptance_criteria: ['done'],
        },
        {
          id: 'b',
          title: 'Second',
          type: 'feature',
          risk: 'low',
          status: 'pending',
          depends_on: ['a'],
          acceptance_criteria: ['done'],
        },
        {
          id: 'c',
          title: 'Third',
          type: 'feature',
          risk: 'low',
          status: 'pending',
          depends_on: ['b'],
          acceptance_criteria: ['done'],
        },
      ],
    };

    const ready = getReadyTasks(graph);
    expect(ready.length).toBe(1);
    expect(ready[0]!.id).toBe('b');
  });

  test('blocked tasks are not ready', () => {
    const graph: GoalGraphInput = {
      objective: 'test',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 'a',
          title: 'Blocked',
          type: 'feature',
          risk: 'low',
          status: 'blocked',
          depends_on: [],
          acceptance_criteria: ['x'],
        },
      ],
    };
    expect(getReadyTasks(graph).length).toBe(0);
  });
});

describe('completeTask: preconditions are validated before writing', () => {
  let projectRoot: string;

  function twoTaskGoal(
    firstStatus: GoalGraphInput['tasks'][0]['status'],
    secondStatus: GoalGraphInput['tasks'][0]['status'],
    risk: GoalGraphInput['tasks'][0]['risk'] = 'low',
  ): GoalGraphInput {
    return {
      objective: 'complete task contract',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 'dep',
          title: 'Dependency',
          type: 'feature',
          risk: 'low',
          status: firstStatus,
          depends_on: [],
          acceptance_criteria: ['x'],
          context_scope: 'isolated',
        },
        {
          id: 'main',
          title: 'Main',
          type: 'feature',
          risk,
          status: secondStatus,
          depends_on: ['dep'],
          acceptance_criteria: ['x'],
          context_scope: 'isolated',
        },
      ],
    };
  }

  const PASSING_TEST = {
    type: 'test',
    data: { runner: 'bun test', result: 'passed' as const, failedTests: [] as string[] },
  };

  const PASSING_REVIEW = {
    type: 'review',
    data: {
      status: 'pass' as const,
      confidence: 0.9,
      verdict: 'approved' as const,
      warnings: [] as string[],
      findings: [] as unknown[],
      artifacts: [] as unknown[],
      next_actions: [] as string[],
    },
  };

  async function statusOf(taskId: string): Promise<string | undefined> {
    const goal = await loadGoal(projectRoot);
    if (!goal.success) return undefined;
    return goal.data.tasks.find((t) => t.id === taskId)?.status;
  }

  async function seedEvidence(
    relatedTask: string,
    id: string,
    body?: { type?: string; data?: Record<string, unknown> },
  ) {
    const dir = evidenceDir(projectRoot);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${id}.json`),
      JSON.stringify({
        id,
        source: 'test',
        type: body?.type ?? 'verification',
        timestamp: new Date().toISOString(),
        relatedTask,
        confidence: 0.9,
        data: body?.data ?? { passed: true, checks: [] },
      }),
      'utf-8',
    );
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-complete-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('errors when the task does not exist', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'in-progress'));

    const result = await completeTask(projectRoot, 'ghost');
    expect(result.success).toBe(false);
  });

  test('errors when the task is not in-progress and leaves it untouched', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    await setActiveTask(projectRoot, 'main');

    const result = await completeTask(projectRoot, 'main');
    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('pending');
  });

  test('errors when a dependency is not done', async () => {
    await writeGoal(projectRoot, twoTaskGoal('pending', 'in-progress'));
    await setActiveTask(projectRoot, 'main');

    const result = await completeTask(projectRoot, 'main');
    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('errors when the task is not registered as active', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'in-progress'));

    const result = await completeTask(projectRoot, 'main');
    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('errors when operational state is invalid', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'in-progress'));
    await setActiveTask(projectRoot, 'main');
    await Bun.write(
      join(projectRoot, '.codeconductor', 'operational-state.json'),
      '{ "version": 99 }',
    );

    const result = await completeTask(projectRoot, 'main');
    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('does not complete an active task without verification evidence ids', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);

    const result = await completeTask(projectRoot, 'main');

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('does not complete when evidence ids are missing and evidence dir does not exist yet', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);

    const result = await completeTask(projectRoot, 'main', ['ev-missing']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('does not complete when evidence id exists but is related to another task', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('other-task', 'ev-other');

    const result = await completeTask(projectRoot, 'main', ['ev-other']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('cc01 review: does not complete with owned verification evidence that failed', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-failed', { data: { passed: false, checks: [] } });

    const result = await completeTask(projectRoot, 'main', ['ev-failed']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('cc01 review: does not complete with owned test evidence that failed', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-test-failed', {
      type: 'test',
      data: { runner: 'bun test', result: 'failed', failedTests: ['x'] },
    });

    const result = await completeTask(projectRoot, 'main', ['ev-test-failed']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('cc01 review: does not complete with only passing test and review evidence', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-test-ok', {
      type: 'test',
      data: { runner: 'bun test', result: 'passed', failedTests: [] },
    });
    await seedEvidence('main', 'ev-review-ok', {
      type: 'review',
      data: {
        status: 'pass',
        confidence: 0.9,
        verdict: 'approved',
        warnings: [],
        findings: [],
        artifacts: [],
        next_actions: [],
      },
    });

    const result = await completeTask(projectRoot, 'main', ['ev-test-ok', 'ev-review-ok']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('cc01 review: completes with passing verification plus supporting test evidence', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');
    await seedEvidence('main', 'ev-test-ok', {
      type: 'test',
      data: { runner: 'bun test', result: 'passed', failedTests: [] },
    });

    const result = await completeTask(projectRoot, 'main', ['ev-verified', 'ev-test-ok']);

    expect(result.success).toBe(true);
    expect(await statusOf('main')).toBe('done');
  });

  test('p0 review: high-risk completeTask fails without review_approved evidence', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending', 'high'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');
    await seedEvidence('main', 'ev-test-ok', PASSING_TEST);

    const result = await completeTask(projectRoot, 'main', ['ev-verified', 'ev-test-ok']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('p0 review: medium-risk completeTask fails with only verification evidence', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending', 'medium'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');

    const result = await completeTask(projectRoot, 'main', ['ev-verified']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
  });

  test('p0 review: medium-risk completeTask succeeds with verification and test evidence', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending', 'medium'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');
    await seedEvidence('main', 'ev-test-ok', PASSING_TEST);

    const result = await completeTask(projectRoot, 'main', ['ev-verified', 'ev-test-ok']);

    expect(result.success).toBe(true);
    expect(await statusOf('main')).toBe('done');
  });

  test('p0 review: low-risk completeTask succeeds with verification evidence alone', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending', 'low'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');

    const result = await completeTask(projectRoot, 'main', ['ev-verified']);

    expect(result.success).toBe(true);
    expect(await statusOf('main')).toBe('done');
  });

  test('p0 review: high-risk completeTask succeeds with verification, test, and review evidence', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending', 'high'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');
    await seedEvidence('main', 'ev-test-ok', PASSING_TEST);
    await seedEvidence('main', 'ev-review-ok', PASSING_REVIEW);

    const result = await completeTask(projectRoot, 'main', [
      'ev-verified',
      'ev-test-ok',
      'ev-review-ok',
    ]);

    expect(result.success).toBe(true);
    expect(await statusOf('main')).toBe('done');
  });

  test('startTask does not report success when the started event cannot be appended', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    await mkdir(join(projectRoot, '.codeconductor', 'events.jsonl'));

    const result = await startTask(projectRoot, 'main', 'implementer');

    expect(result.success).toBe(false);
  });

  test('startTask leaves the task pending and inactive when the started event cannot be appended', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    await mkdir(join(projectRoot, '.codeconductor', 'events.jsonl'));

    const result = await startTask(projectRoot, 'main', 'implementer');

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('pending');
    const state = await loadOperationalState(projectRoot);
    expect(state.success).toBe(true);
    if (!state.success) return;
    expect(state.data.activeTaskIds).not.toContain('main');
  });

  test('completeTask does not report success when the completed event cannot be appended', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');

    const eventPath = join(projectRoot, '.codeconductor', 'events.jsonl');
    await rm(eventPath);
    await mkdir(eventPath);

    const result = await completeTask(projectRoot, 'main', ['ev-verified']);

    expect(result.success).toBe(false);
  });

  test('completeTask leaves the task in-progress and active when the completed event cannot be appended', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);
    await seedEvidence('main', 'ev-verified');

    const eventPath = join(projectRoot, '.codeconductor', 'events.jsonl');
    await rm(eventPath);
    await mkdir(eventPath);

    const result = await completeTask(projectRoot, 'main', ['ev-verified']);

    expect(result.success).toBe(false);
    expect(await statusOf('main')).toBe('in-progress');
    const state = await loadOperationalState(projectRoot);
    expect(state.success).toBe(true);
    if (!state.success) return;
    expect(state.data.activeTaskIds).toContain('main');
  });

  test('completes the task and preserves other active task ids', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    await setActiveTask(projectRoot, 'other-task', 'tester');
    const start = await startTask(projectRoot, 'main', 'implementer');
    expect(start.success).toBe(true);
    await seedEvidence('main', 'ev-verified');

    const result = await completeTask(projectRoot, 'main', ['ev-verified']);
    expect(result.success).toBe(true);
    expect(await statusOf('main')).toBe('done');

    const state = await loadOperationalState(projectRoot);
    expect(state.success).toBe(true);
    if (!state.success) return;
    expect(state.data.activeTaskIds).toEqual(['other-task']);
  });

  test('cc01 review: successful completeTask preserves activeAgents of other tasks', async () => {
    await writeGoal(projectRoot, twoTaskGoal('done', 'pending'));
    await setActiveTask(projectRoot, 'other-task', 'tester');
    const start = await startTask(projectRoot, 'main', 'implementer');
    expect(start.success).toBe(true);
    await seedEvidence('main', 'ev-verified');

    const result = await completeTask(projectRoot, 'main', ['ev-verified']);
    expect(result.success).toBe(true);

    const state = await loadOperationalState(projectRoot);
    expect(state.success).toBe(true);
    if (!state.success) return;
    expect(state.data.activeTaskIds).toEqual(['other-task']);
    expect(state.data.activeAgents).toContain('tester');
  });
});

describe('startTask: only pending tasks may start', () => {
  let projectRoot: string;

  function goalWithStatus(
    status: GoalGraphInput['tasks'][0]['status'],
  ): GoalGraphInput {
    return {
      objective: 'start task contract',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 'task-1',
          title: 'Task',
          type: 'feature',
          risk: 'low',
          status,
          depends_on: [],
          acceptance_criteria: ['x'],
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

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-start-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('p0 review: startTask rejects a done task', async () => {
    await writeGoal(projectRoot, goalWithStatus('done'));

    const result = await startTask(projectRoot, 'task-1', 'implementer');

    expect(result.success).toBe(false);
    expect(await statusOf('task-1')).toBe('done');
  });

  test('p0 review: startTask rejects a blocked task', async () => {
    await writeGoal(projectRoot, goalWithStatus('blocked'));

    const result = await startTask(projectRoot, 'task-1', 'implementer');

    expect(result.success).toBe(false);
    expect(await statusOf('task-1')).toBe('blocked');
  });

  test('p0 review: startTask rejects an in-progress task', async () => {
    await writeGoal(projectRoot, goalWithStatus('in-progress'));
    await setActiveTask(projectRoot, 'task-1', 'implementer');

    const result = await startTask(projectRoot, 'task-1', 'implementer');

    expect(result.success).toBe(false);
    expect(await statusOf('task-1')).toBe('in-progress');
  });

  test('p0 review: startTask accepts a pending task', async () => {
    await writeGoal(projectRoot, goalWithStatus('pending'));

    const result = await startTask(projectRoot, 'task-1', 'implementer');

    expect(result.success).toBe(true);
    expect(await statusOf('task-1')).toBe('in-progress');
  });
});
