import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  completeTask,
  rollbackTaskStatus,
  startTask,
} from '../src/core/orchestrator/runtime-orchestrator';
import { loadGoal, writeGoal } from '../src/core/goal/goal-state';
import { loadOperationalState } from '../src/core/memory/operational-state';
import type { GoalGraphInput } from '../src/validation/schemas';

function goal(): GoalGraphInput {
  return {
    objective: 'rollback contract',
    created_at: new Date().toISOString(),
    tasks: [
      {
        id: 'main',
        title: 'Main',
        type: 'feature',
        risk: 'low',
        status: 'pending',
        depends_on: [],
        acceptance_criteria: ['x'],
        context_scope: 'isolated',
      },
    ],
  };
}

describe('rollbackTaskStatus and completeTask', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-rollback-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('rollbackTaskStatus restores previous status and operational state', async () => {
    await writeGoal(projectRoot, goal());
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);

    const graph = await loadGoal(projectRoot);
    expect(graph.success).toBe(true);
    if (!graph.success) return;
    const task = graph.data.tasks.find((t) => t.id === 'main')!;
    expect(task.status).toBe('in-progress');

    const previousState = {
      version: 1 as const,
      activeAgents: [],
      activeTaskIds: [],
      blockers: [],
      updatedAt: new Date().toISOString(),
    };

    const rolled = await rollbackTaskStatus(
      projectRoot,
      graph.data,
      task,
      'pending',
      previousState,
      new Error('event append failed'),
    );
    expect(rolled.success).toBe(false);
    if (rolled.success) return;
    expect(rolled.error.message).toContain('event append failed');

    const after = await loadGoal(projectRoot);
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data.tasks[0]!.status).toBe('pending');

    const state = await loadOperationalState(projectRoot);
    expect(state.success).toBe(true);
    if (!state.success) return;
    expect(state.data.activeTaskIds).not.toContain('main');
  });

  test('completeTask rejects completion without verification evidence', async () => {
    await writeGoal(projectRoot, goal());
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);

    const none = await completeTask(projectRoot, 'main');
    expect(none.success).toBe(false);
    if (!none.success) {
      expect(none.error.message).toMatch(/without verification evidence/);
    }

    const empty = await completeTask(projectRoot, 'main', []);
    expect(empty.success).toBe(false);

    const after = await loadGoal(projectRoot);
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data.tasks[0]!.status).toBe('in-progress');
  });

  test('completeTask rolls back when the completed event cannot be appended', async () => {
    await writeGoal(projectRoot, goal());
    const started = await startTask(projectRoot, 'main', 'implementer');
    expect(started.success).toBe(true);

    const { mkdir: mkdirEvidence, writeFile } = await import('node:fs/promises');
    const { evidenceDir } = await import('../src/core/product-graph/paths');
    const dir = evidenceDir(projectRoot);
    await mkdirEvidence(dir, { recursive: true });
    await writeFile(
      join(dir, 'ev-verified.json'),
      JSON.stringify({
        id: 'ev-verified',
        source: 'test',
        type: 'verification',
        timestamp: new Date().toISOString(),
        relatedTask: 'main',
        confidence: 0.9,
        data: { passed: true, checks: [] },
      }),
      'utf-8',
    );

    const eventPath = join(projectRoot, '.codeconductor', 'events.jsonl');
    await rm(eventPath);
    await mkdir(eventPath);

    const result = await completeTask(projectRoot, 'main', ['ev-verified']);
    expect(result.success).toBe(false);

    const after = await loadGoal(projectRoot);
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data.tasks[0]!.status).toBe('in-progress');

    const state = await loadOperationalState(projectRoot);
    expect(state.success).toBe(true);
    if (!state.success) return;
    expect(state.data.activeTaskIds).toContain('main');
  });
});
