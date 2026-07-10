/**
 * End-to-end CLI tests for the `goal` and `cc-goal` commands.
 *
 * Verifies the full pipeline: parse args → router → goalCommand → planner →
 * write → load. Confirms both `goal` and `cc-goal` work as aliases for the
 * same handler, JSON output goes to stdout, and error cases exit non-zero.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
let TEST_DIR: string;
let GOAL_FILE: string;
const CLI_CMD = [process.execPath, 'run', join(PROJECT_ROOT, 'src/cli/main.ts')];

async function runCli(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { spawn } = await import('bun');
  const child = spawn({
    cmd: [...CLI_CMD, ...args],
    cwd: TEST_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  return { exitCode, stdout, stderr };
}

async function cleanup() {
  try {
    // Only remove the goal file we create; preserve project configuration.
    await rm(GOAL_FILE, { force: true });
  } catch {}
}

describe('CLI: goal command (end-to-end)', () => {
  beforeAll(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-goal-cli-test-'));
    GOAL_FILE = join(TEST_DIR, '.codeconductor', 'current-goal.yml');
    await writeFile(join(TEST_DIR, 'package.json'), await readFile(join(PROJECT_ROOT, 'package.json')));
  });

  afterAll(async () => {
    if (TEST_DIR) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await cleanup();
  });

  test('goal "<objective>" writes current-goal.yml and exits 0', async () => {
    const result = await runCli(['goal', 'Create a login system']);
    expect(result.exitCode).toBe(0);
    expect(existsSync(GOAL_FILE)).toBe(true);
  });

  test('cc-goal "<objective>" alias works identically', async () => {
    const result = await runCli(['cc-goal', 'Create a login system']);
    expect(result.exitCode).toBe(0);
    expect(existsSync(GOAL_FILE)).toBe(true);
  });

  test('--output=json emits valid JSON with objective and tasks', async () => {
    const result = await runCli(['goal', 'Create a login system', '--output=json']);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.objective).toBe('Create a login system');
    expect(json.tasks).toBeArray();
    expect(json.tasks.length).toBe(4);
    expect(json.file).toBe('.codeconductor/current-goal.yml');
  });

  test('cc-goal --output=json produces the same JSON shape', async () => {
    const result = await runCli(['cc-goal', 'Build a CRUD API', '--output=json']);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.objective).toBe('Build a CRUD API');
    expect(json.tasks.length).toBe(4);
    // First task should be the data model (crud-model)
    expect(json.tasks[0].id).toBe('crud-model');
  });

  test('human output includes Objective and Task dependency graph headers', async () => {
    const result = await runCli(['goal', 'Create a login system']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Objective:');
    expect(result.stdout).toContain('Task dependency graph:');
    expect(result.stdout).toContain('auth-schema');
  });

  test('YAML written by CLI is re-readable by loadGoal', async () => {
    const result = await runCli(['goal', 'Create a login system', '--output=json']);
    expect(result.exitCode).toBe(0);

    const content = await readFile(GOAL_FILE, 'utf-8');
    const { parse } = await import('yaml');
    const parsed = parse(content);
    expect(parsed.objective).toBe('Create a login system');
    expect(parsed.tasks).toBeArray();
    expect(parsed.tasks.length).toBe(4);
    // Each task should have its full structure
    for (const task of parsed.tasks) {
      expect(task.id).toBeString();
      expect(task.title).toBeString();
      expect(['feature', 'fix', 'refactor', 'test', 'docs']).toContain(task.type);
      expect(['low', 'medium', 'high']).toContain(task.risk);
    }
  });

  test('empty objective fails with exit code 1 and helpful error on stderr', async () => {
    const result = await runCli(['goal', '']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Objective is required');
    expect(existsSync(GOAL_FILE)).toBe(false);
  });

  test('help text mentions both goal and cc-goal', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/goal\s*\/\s*cc-goal/);
  });
});
