/**
 * Tests for goal state persistence and validation.
 *
 * Covers `writeGoal` and `loadGoal` from `src/core/goal/goal-state.ts`.
 * The current-goal.yml file is the orchestrator's source of truth for
 * tracking task graph state across sessions. Validation must reject:
 *   - duplicate task IDs
 *   - depends_on references to unknown tasks
 *   - cycles in the dependency graph
 *   - malformed YAML and schema-violating data
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadGoal, writeGoal } from '../src/core/goal/goal-state';
import { planGoal } from '../src/core/goal/goal-planner';
import { GoalGraphSchema, type GoalGraphInput } from '../src/validation/schemas';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
let TEST_DIR: string;
let GOAL_DIR: string;
let GOAL_FILE: string;

async function cleanup() {
  try {
    await rm(GOAL_DIR, { recursive: true, force: true });
  } catch {}
}

describe('goal-state: writeGoal / loadGoal', () => {
  beforeAll(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-goal-state-test-'));
    GOAL_DIR = join(TEST_DIR, '.codeconductor');
    GOAL_FILE = join(GOAL_DIR, 'current-goal.yml');
  });

  afterAll(async () => {
    if (TEST_DIR) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('writeGoal creates .codeconductor directory and current-goal.yml', async () => {
    const graph = planGoal('Create a login system');
    const result = await writeGoal(TEST_DIR, graph);
    expect(result.success).toBe(true);
    expect(existsSync(GOAL_DIR)).toBe(true);
    expect(existsSync(GOAL_FILE)).toBe(true);
  });

  test('writeGoal + loadGoal round-trip preserves all fields', async () => {
    const graph = planGoal('Build a CRUD API for products');
    const writeResult = await writeGoal(TEST_DIR, graph);
    expect(writeResult.success).toBe(true);

    const loadResult = await loadGoal(TEST_DIR);
    expect(loadResult.success).toBe(true);
    if (!loadResult.success) return;

    const loaded = loadResult.data;
    expect(loaded.objective).toBe(graph.objective);
    expect(loaded.tasks.length).toBe(graph.tasks.length);
    for (let i = 0; i < loaded.tasks.length; i++) {
      expect(loaded.tasks[i].id).toBe(graph.tasks[i].id);
      expect(loaded.tasks[i].title).toBe(graph.tasks[i].title);
      expect(loaded.tasks[i].type).toBe(graph.tasks[i].type);
      expect(loaded.tasks[i].risk).toBe(graph.tasks[i].risk);
      expect(loaded.tasks[i].status).toBe(graph.tasks[i].status);
      expect(loaded.tasks[i].depends_on).toEqual(graph.tasks[i].depends_on);
      expect(loaded.tasks[i].acceptance_criteria).toEqual(
        graph.tasks[i].acceptance_criteria,
      );
    }
  });

  test('loaded graph passes Zod schema validation', async () => {
    const graph = planGoal('Create a login system');
    await writeGoal(TEST_DIR, graph);

    const loadResult = await loadGoal(TEST_DIR);
    expect(loadResult.success).toBe(true);
    if (!loadResult.success) return;

    // Re-validating should not throw
    const revalidated = GoalGraphSchema.parse(loadResult.data);
    expect(revalidated.tasks.length).toBe(4);
  });

  test('loadGoal returns error when file does not exist', async () => {
    const loadResult = await loadGoal(TEST_DIR);
    expect(loadResult.success).toBe(false);
    if (loadResult.success) return;
    expect(loadResult.error).toBeInstanceOf(Error);
  });

  test('loadGoal rejects malformed YAML', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    await writeFile(GOAL_FILE, '::: not valid yaml :::\n  - [\n', 'utf-8');

    const loadResult = await loadGoal(TEST_DIR);
    expect(loadResult.success).toBe(false);
  });

  test('loadGoal rejects YAML that violates schema (missing required fields)', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    // Missing `created_at` and `acceptance_criteria`
    const broken = `
objective: test
tasks:
  - id: t1
    title: t1
    type: feature
    risk: low
    status: pending
`;
    await writeFile(GOAL_FILE, broken, 'utf-8');

    const loadResult = await loadGoal(TEST_DIR);
    expect(loadResult.success).toBe(false);
  });

  test('loadGoal rejects unknown task type enum value', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    const broken = `
objective: test
created_at: "2025-01-01T00:00:00Z"
tasks:
  - id: t1
    title: t1
    type: not-a-real-type
    risk: low
    status: pending
    depends_on: []
    acceptance_criteria: ["x"]
`;
    await writeFile(GOAL_FILE, broken, 'utf-8');

    const loadResult = await loadGoal(TEST_DIR);
    expect(loadResult.success).toBe(false);
  });
});

describe('goal-state: validation rejects malformed graphs', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  /**
   * Build a minimal valid graph and optionally mutate it.
   */
  function makeGraph(
    mutate: (tasks: GoalGraphInput['tasks']) => GoalGraphInput['tasks']
  ): GoalGraphInput {
    const base = planGoal('Create a login system');
    return { ...base, tasks: mutate(base.tasks.map((t) => ({ ...t }))) };
  }

  test('writeGoal rejects duplicate task IDs', async () => {
    const graph = makeGraph((tasks) => {
      tasks[0]!.id = 'auth-schema';
      tasks[1]!.id = 'auth-schema'; // duplicate
      return tasks;
    });

    const result = await writeGoal(TEST_DIR, graph);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toMatch(/[Dd]uplicate/);
  });

  test('writeGoal rejects depends_on reference to unknown task', async () => {
    const graph = makeGraph((tasks) => {
      tasks[0]!.depends_on = ['nonexistent-task'];
      return tasks;
    });

    const result = await writeGoal(TEST_DIR, graph);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toMatch(/unknown task/i);
    expect(result.error.message).toContain('nonexistent-task');
  });

  test('writeGoal rejects direct cycle (A -> B -> A)', async () => {
    const graph = makeGraph((tasks) => {
      // tasks[0] is auth-schema, tasks[1] is auth-api (depends on tasks[0])
      // Create a cycle: tasks[0].depends_on = ['auth-api']
      tasks[0]!.depends_on = ['auth-api'];
      return tasks;
    });

    const result = await writeGoal(TEST_DIR, graph);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toMatch(/[Cc]ycle/);
  });

  test('writeGoal rejects indirect cycle (A -> B -> C -> A)', async () => {
    const graph = makeGraph((tasks) => {
      // auth-schema → auth-api → auth-impl → auth-tests → auth-schema
      tasks[0]!.depends_on = ['auth-tests'];
      return tasks;
    });

    const result = await writeGoal(TEST_DIR, graph);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toMatch(/[Cc]ycle/);
  });

  test('writeGoal does NOT create the file when validation fails', async () => {
    const graph = makeGraph((tasks) => {
      tasks[0]!.depends_on = ['does-not-exist'];
      return tasks;
    });

    await writeGoal(TEST_DIR, graph);
    expect(existsSync(GOAL_FILE)).toBe(false);
  });
});

describe('goal-state: YAML structure', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('YAML file contains objective, tasks, and created_at top-level keys', async () => {
    const graph = planGoal('Implement full-text search');
    await writeGoal(TEST_DIR, graph);

    const content = await readFile(GOAL_FILE, 'utf-8');
    expect(content).toMatch(/^objective:/m);
    expect(content).toMatch(/^tasks:/m);
    expect(content).toMatch(/^created_at:/m);
  });

  test('YAML re-parses to the same objective', async () => {
    const objective = 'Add email notification system';
    const graph = planGoal(objective);
    await writeGoal(TEST_DIR, graph);

    const content = await readFile(GOAL_FILE, 'utf-8');
    const { parse } = await import('yaml');
    const parsed = parse(content);
    expect(parsed.objective).toBe(objective);
    expect(parsed.tasks).toBeArray();
    expect(parsed.tasks.length).toBe(4);
  });
});
