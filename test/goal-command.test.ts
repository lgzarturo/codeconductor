import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { goalCommand } from '../src/commands/goal.command';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const GOAL_FILE = join(PROJECT_ROOT, '.codeconductor', 'current-goal.yml');

async function cleanup() {
  try {
    await rm(join(PROJECT_ROOT, '.codeconductor'), { recursive: true, force: true });
  } catch {}
}

describe('goal command', () => {
  beforeEach(async () => {
    await cleanup();
  });

  test('goalCommand returns success with valid objective', async () => {
    const result = await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });
    expect(result.code).toBe(0);
    expect(result.data).toBeDefined();
    const data = result.data as { success: boolean; command: string; output: string };
    expect(data.success).toBe(true);
    expect(data.command).toBe('goal');
    expect(data.output).toContain('Objective:');
    expect(data.output).toContain('Task dependency graph:');
  });

  test('goalCommand writes current-goal.yml', async () => {
    const result = await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });
    expect(result.code).toBe(0);
    expect(existsSync(GOAL_FILE)).toBe(true);

    const content = await readFile(GOAL_FILE, 'utf-8');
    expect(content).toContain('objective:');
    expect(content).toContain('Create a login system');
    expect(content).toContain('tasks:');
  });

  test('goalCommand with JSON output', async () => {
    const result = await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as {
      success: boolean;
      command: string;
      objective: string;
      tasks: Array<{ id: string; title: string; depends_on: string[] }>;
    };
    expect(data.success).toBe(true);
    expect(data.objective).toBe('Create a login system');
    expect(data.tasks).toBeArray();
    expect(data.tasks.length).toBe(4);
  });

  test('goalCommand fails with empty objective', async () => {
    const result = await goalCommand({
      objective: '',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });
    expect(result.code).toBe(1);
    const data = result.data as { success: boolean; errors: string[] };
    expect(data.success).toBe(false);
    expect(data.errors).toContain('Objective is required. Usage: codeconductor goal "<objective>"');
  });

  test('goalCommand fails with whitespace-only objective', async () => {
    const result = await goalCommand({
      objective: '   ',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });
    expect(result.code).toBe(1);
  });

  test('goalCommand renders dependency tree', async () => {
    const result = await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });
    expect(result.code).toBe(0);
    const data = result.data as { output: string };
    // Should show tree connectors
    expect(data.output).toMatch(/[├└]──/);
  });

  test('goalCommand with cc-goal alias', async () => {
    // cc-goal is handled by router, but goalCommand itself doesn't care about alias
    // Test that the command works the same way
    const result = await goalCommand({
      objective: 'Build a CRUD API',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });
    expect(result.code).toBe(0);
    expect(existsSync(GOAL_FILE)).toBe(true);
  });

  test('goalCommand produces re-readable YAML', async () => {
    await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });

    // Load and verify the YAML is valid
    const content = await readFile(GOAL_FILE, 'utf-8');
    const { parse } = await import('yaml');
    const parsed = parse(content);
    expect(parsed.objective).toBe('Create a login system');
    expect(parsed.tasks).toBeArray();
    expect(parsed.created_at).toBeString();
  });

  test('goalCommand with search objective produces search template via JSON', async () => {
    const result = await goalCommand({
      objective: 'Implement full-text search',
      projectRoot: PROJECT_ROOT,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as {
      success: boolean;
      tasks: Array<{ id: string }>;
    };
    expect(data.success).toBe(true);
    expect(data.tasks[0].id).toMatch(/^search-/);
  });

  test('goalCommand with notification objective produces notif template via JSON', async () => {
    const result = await goalCommand({
      objective: 'Add email notification system',
      projectRoot: PROJECT_ROOT,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; tasks: Array<{ id: string }> };
    expect(data.success).toBe(true);
    expect(data.tasks[0].id).toMatch(/^notif-/);
  });

  test('goalCommand with migration objective produces migrate template via JSON', async () => {
    const result = await goalCommand({
      objective: 'Migrate user table schema',
      projectRoot: PROJECT_ROOT,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; tasks: Array<{ id: string }> };
    expect(data.success).toBe(true);
    expect(data.tasks[0].id).toMatch(/^migrate-/);
  });

  test('goalCommand with unknown objective uses generic template via JSON', async () => {
    const result = await goalCommand({
      objective: 'Do something completely novel',
      projectRoot: PROJECT_ROOT,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; tasks: Array<{ id: string }> };
    expect(data.success).toBe(true);
    expect(data.tasks[0].id).toMatch(/^plan-/);
  });

  test('JSON output structure matches what loadGoal would return', async () => {
    const result = await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as {
      tasks: Array<{
        id: string;
        title: string;
        type: string;
        risk: string;
        status: string;
        depends_on: string[];
        acceptance_criteria: string[];
      }>;
    };

    // Every task should have all required fields, and they should match
    // what the YAML file contains.
    const yamlContent = await readFile(GOAL_FILE, 'utf-8');
    const { parse } = await import('yaml');
    const parsed = parse(yamlContent) as { tasks: Array<{ id: string }> };

    expect(data.tasks.length).toBe(parsed.tasks.length);
    for (let i = 0; i < data.tasks.length; i++) {
      expect(data.tasks[i].id).toBe(parsed.tasks[i].id);
    }
  });

  test('human output includes task count and file path summary', async () => {
    const result = await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'human',
    });
    expect(result.code).toBe(0);
    const data = result.data as { output: string };
    expect(data.output).toMatch(/Tasks: \d+ total/);
    expect(data.output).toContain('.codeconductor/current-goal.yml');
  });

  test('JSON output does not include human-rendered tree', async () => {
    const result = await goalCommand({
      objective: 'Create a login system',
      projectRoot: PROJECT_ROOT,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as { output?: string };
    // JSON mode should NOT have a human `output` string
    expect(data.output).toBeUndefined();
  });
});
