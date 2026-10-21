import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claimNextTask,
  taskTypeToDispatchMode,
} from '../src/core/orchestrator/runtime-orchestrator';
import { loadGoal, writeGoal } from '../src/core/goal/goal-state';
import { saveGraph } from '../src/core/product-graph/graph-store';
import type { GoalGraphInput, GoalTaskInput } from '../src/validation/schemas';

function makeTask(overrides: Partial<GoalTaskInput> = {}): GoalTaskInput {
  return {
    id: 'task-1',
    title: 'Widget tests',
    type: 'test',
    risk: 'low',
    status: 'pending',
    depends_on: [],
    acceptance_criteria: ['green'],
    ...overrides,
  };
}

function makeGraph(tasks: GoalTaskInput[]): GoalGraphInput {
  return { objective: 'test dispatch modes', created_at: new Date().toISOString(), tasks };
}

describe('taskTypeToDispatchMode', () => {
  test('maps the five goal task types to dispatch modes', () => {
    expect(taskTypeToDispatchMode('fix')).toBe('surgical-fix');
    expect(taskTypeToDispatchMode('refactor')).toBe('refactor-only');
    expect(taskTypeToDispatchMode('test')).toBe('test-add');
    expect(taskTypeToDispatchMode('feature')).toBe('full');
    expect(taskTypeToDispatchMode('docs')).toBe('full');
  });
});

describe('orchestrator dispatch-mode enforcement', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-dispatch-modes-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function seedGraphWithComponent(task: GoalTaskInput, componentPath: string) {
    const graph = makeGraph([task]);
    const written = await writeGoal(projectRoot, graph);
    expect(written.success).toBe(true);
    const saved = await saveGraph(projectRoot, {
      version: 1,
      productId: 'p',
      productName: 'p',
      nodes: [{ id: 'n1', type: 'component', name: 'Widget', data: { path: componentPath } }],
      edges: [],
      updatedAt: new Date().toISOString(),
    });
    expect(saved.success).toBe(true);
  }

  test('RED: denies dispatch of a test task whose inferred target is a src file', async () => {
    await seedGraphWithComponent(makeTask({ title: 'Widget tests' }), 'src/widget.ts');
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    await writeFile(join(projectRoot, 'src/widget.ts'), 'export {};\n');

    const next = await claimNextTask(projectRoot, 'proj');
    expect(next.success).toBe(false);
    if (next.success) return;
    expect(next.error.message).toContain('DispatchMode(test-add)');

    const goal = await loadGoal(projectRoot);
    expect(goal.success).toBe(true);
    if (!goal.success) return;
    expect(goal.data.tasks[0]!.status).toBe('pending');
  });

  test('denies dispatch of a refactor task whose inferred target does not exist', async () => {
    await seedGraphWithComponent(
      makeTask({ title: 'Widget cleanup', type: 'refactor' }),
      'src/widget.ts',
    );

    const next = await claimNextTask(projectRoot, 'proj');
    expect(next.success).toBe(false);
    if (next.success) return;
    expect(next.error.message).toContain('DispatchMode(refactor-only)');
  });

  test('allows dispatch of a fix task with an existing in-scope target and reports the mode', async () => {
    await seedGraphWithComponent(
      makeTask({ title: 'Widget bugfix', type: 'fix' }),
      'src/widget.ts',
    );
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    await writeFile(join(projectRoot, 'src/widget.ts'), 'export {};\n');

    const next = await claimNextTask(projectRoot, 'proj');
    expect(next.success).toBe(true);
    if (!next.success) return;
    expect(next.data.dispatchMode).toBe('surgical-fix');
    expect(next.data.task.id).toBe('task-1');
  });

  test('allows dispatch when no target files are inferred', async () => {
    const written = await writeGoal(projectRoot, makeGraph([makeTask()]));
    expect(written.success).toBe(true);

    const next = await claimNextTask(projectRoot, 'proj');
    expect(next.success).toBe(true);
    if (!next.success) return;
    expect(next.data.dispatchMode).toBe('test-add');
  });
});
