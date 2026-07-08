import { describe, expect, test } from 'bun:test';
import { planGoal } from '../src/core/goal/goal-planner';

describe('goal-planner', () => {
  test('returns valid GoalGraph structure', () => {
    const graph = planGoal('Add pagination');
    expect(graph.objective).toBe('Add pagination');
    expect(graph.tasks).toBeArray();
    expect(graph.tasks.length).toBeGreaterThan(0);
    expect(graph.created_at).toBeString();
    expect(new Date(graph.created_at).getTime()).not.toBeNaN();
  });

  test('all tasks have required fields', () => {
    const graph = planGoal('Add pagination');
    for (const task of graph.tasks) {
      expect(task.id).toBeString();
      expect(task.title).toBeString();
      expect(['feature', 'fix', 'refactor', 'test', 'docs']).toContain(task.type);
      expect(['low', 'medium', 'high']).toContain(task.risk);
      expect(task.status).toBe('pending');
      expect(task.acceptance_criteria).toBeArray();
      expect(task.acceptance_criteria.length).toBeGreaterThan(0);
      expect(task.depends_on).toBeArray();
    }
  });

  test('task IDs are unique', () => {
    const graph = planGoal('Add pagination');
    const ids = graph.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('depends_on references are valid', () => {
    const graph = planGoal('Add pagination');
    const ids = new Set(graph.tasks.map((t) => t.id));
    for (const task of graph.tasks) {
      for (const dep of task.depends_on ?? []) {
        expect(ids.has(dep)).toBe(true);
      }
    }
  });

  test('auth objective produces auth template', () => {
    const graph = planGoal('Create a login system');
    expect(graph.tasks.length).toBe(4);
    expect(graph.tasks[0].id).toMatch(/^auth-/);
    expect(graph.tasks[0].title).toContain('auth');
  });

  test('crud objective produces crud template', () => {
    const graph = planGoal('Build a CRUD API for products');
    expect(graph.tasks.length).toBe(4);
    expect(graph.tasks[0].id).toMatch(/^crud-/);
  });

  test('search objective produces search template', () => {
    const graph = planGoal('Implement full-text search');
    expect(graph.tasks.length).toBe(4);
    expect(graph.tasks[0].id).toMatch(/^search-/);
  });

  test('notification objective produces notif template', () => {
    const graph = planGoal('Add email notification system');
    expect(graph.tasks.length).toBe(4);
    expect(graph.tasks[0].id).toMatch(/^notif-/);
  });

  test('migration objective produces migrate template', () => {
    const graph = planGoal('Migrate user table schema');
    expect(graph.tasks.length).toBe(4);
    expect(graph.tasks[0].id).toMatch(/^migrate-/);
  });

  test('unknown objective uses generic template', () => {
    const graph = planGoal('Refactor the build system');
    expect(graph.tasks.length).toBe(4);
    expect(graph.tasks[0].id).toMatch(/^plan-/);
  });

  test('generic fallback has correct dependency chain', () => {
    const graph = planGoal('Refactor the build system');
    const tasks = graph.tasks;
    // First task has no deps
    expect(tasks[0].depends_on).toEqual([]);
    // Second depends on first
    expect(tasks[1].depends_on).toContain(tasks[0].id);
    // Third depends on second
    expect(tasks[2].depends_on).toContain(tasks[1].id);
    // Fourth depends on third
    expect(tasks[3].depends_on).toContain(tasks[2].id);
  });

  test('auth template has correct dependency chain', () => {
    const graph = planGoal('Create a login system');
    const tasks = graph.tasks;
    expect(tasks[0].depends_on).toEqual([]);
    expect(tasks[1].depends_on).toContain(tasks[0].id);
    expect(tasks[2].depends_on).toContain(tasks[1].id);
    expect(tasks[3].depends_on).toContain(tasks[2].id);
  });

  test('objective is preserved in graph', () => {
    const objective = 'Build a real-time notification system with email and push';
    const graph = planGoal(objective);
    expect(graph.objective).toBe(objective);
  });

  test('all tasks are pending by default', () => {
    const graph = planGoal('Create a login system');
    for (const task of graph.tasks) {
      expect(task.status).toBe('pending');
    }
  });

  test('AC3: auth template produces Database → API Contract → Implementation → Tests chain', () => {
    const graph = planGoal('Create a login system');
    const tasks = graph.tasks;

    // The first task must be data model / schema (Database)
    expect(tasks[0].id).toBe('auth-schema');
    const schemaTitle = tasks[0].title.toLowerCase();
    expect(schemaTitle).toMatch(/data model|schema|db/);

    // The second must define the API contract
    expect(tasks[1].id).toBe('auth-api');
    const apiTitle = tasks[1].title.toLowerCase();
    expect(apiTitle).toMatch(/api|contract|endpoint/);

    // The third must be the implementation
    expect(tasks[2].id).toBe('auth-impl');
    const implTitle = tasks[2].title.toLowerCase();
    expect(implTitle).toMatch(/implement/);

    // The fourth must be tests
    expect(tasks[3].id).toBe('auth-tests');
    const testsTitle = tasks[3].title.toLowerCase();
    expect(testsTitle).toMatch(/test/);
    expect(tasks[3].type).toBe('test');

    // The chain order must be strictly linear
    expect(tasks[0].depends_on).toEqual([]);
    expect(tasks[1].depends_on).toEqual(['auth-schema']);
    expect(tasks[2].depends_on).toEqual(['auth-api']);
    expect(tasks[3].depends_on).toEqual(['auth-impl']);
  });

  test('partial keyword "login" matches auth template', () => {
    const graph = planGoal('Add user login flow');
    expect(graph.tasks[0].id).toMatch(/^auth-/);
  });

  test('keyword "signin" matches auth template', () => {
    const graph = planGoal('Build a signin page');
    expect(graph.tasks[0].id).toMatch(/^auth-/);
  });

  test('keyword "sign-in" with hyphen matches auth template', () => {
    const graph = planGoal('Implement sign-in functionality');
    expect(graph.tasks[0].id).toMatch(/^auth-/);
  });

  test('keyword "authentication" matches auth template', () => {
    const graph = planGoal('Add authentication middleware');
    expect(graph.tasks[0].id).toMatch(/^auth-/);
  });

  test('template matching is case-insensitive', () => {
    const graph = planGoal('CREATE A LOGIN SYSTEM');
    expect(graph.tasks[0].id).toMatch(/^auth-/);
  });

  test('mixed-case keyword "Crud" matches crud template', () => {
    const graph = planGoal('Build a Crud endpoint');
    expect(graph.tasks[0].id).toMatch(/^crud-/);
  });

  test('each template task has explicit, non-empty acceptance_criteria', () => {
    const objectives = [
      'Create a login system',
      'Build a CRUD API for products',
      'Implement full-text search',
      'Add email notification system',
      'Migrate user table schema',
    ];
    for (const obj of objectives) {
      const graph = planGoal(obj);
      for (const task of graph.tasks) {
        expect(task.acceptance_criteria.length).toBeGreaterThan(0);
        for (const criterion of task.acceptance_criteria) {
          expect(typeof criterion).toBe('string');
          expect(criterion.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('each template task has a valid risk level', () => {
    const graph = planGoal('Create a login system');
    for (const task of graph.tasks) {
      expect(['low', 'medium', 'high']).toContain(task.risk);
    }
  });

  test('generic template is used for non-matching objective', () => {
    // "Refactor the build system" should not match auth/crud/search/notif/migrate
    const graph = planGoal('Refactor the build system');
    expect(graph.tasks[0].id).toMatch(/^plan-/);
    expect(graph.tasks[0].id).toBe('plan-scope');
  });

  test('"notify" keyword matches notification template', () => {
    const graph = planGoal('Notify users on signup');
    expect(graph.tasks[0].id).toMatch(/^notif-/);
  });

  test('"column" keyword matches migration template', () => {
    const graph = planGoal('Add a new column to users');
    expect(graph.tasks[0].id).toMatch(/^migrate-/);
  });

  test('created_at is a valid ISO 8601 timestamp', () => {
    const graph = planGoal('Create a login system');
    expect(graph.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(graph.created_at))).toBe(false);
  });
});
