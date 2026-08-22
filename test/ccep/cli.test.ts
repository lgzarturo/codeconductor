/**
 * End-to-end CLI tests for the `ccep` command.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
let TEST_DIR: string;
const CLI_CMD = [process.execPath, 'run', join(PROJECT_ROOT, 'src/cli/main.ts')];

async function runCli(
  args: string[],
  cwd = TEST_DIR,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { spawn } = await import('bun');
  const child = spawn({
    cmd: [...CLI_CMD, ...args],
    cwd,
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

describe('CLI: ccep command (end-to-end)', () => {
  beforeAll(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'ccep-cli-test-'));
    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify({ name: 'ccep-cli-fixture', type: 'module' }),
    );
  });

  afterAll(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('ccep parse --command fix emits valid envelope JSON', async () => {
    const result = await runCli([
      'ccep',
      'parse',
      '--command',
      'fix',
      'login fails on Safari',
      '--output=json',
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.envelope.protocolVersion).toBe('ccep-1');
    expect(json.envelope.command).toBe('fix');
    expect(json.envelope.userRequest).toBe('login fails on Safari');
  });

  test('ccep profile council emits workflow profile JSON', async () => {
    const result = await runCli(['ccep', 'profile', 'council', '--output=json']);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.profile.command).toBe('council');
    expect(json.profile.phases.map((p: { id: string }) => p.id)).toContain('deliberation');
  });

  test('ccep resolve binds envelope to profile', async () => {
    const result = await runCli([
      'ccep',
      'resolve',
      '--command',
      'feature',
      'Add loyalty benefits',
      '--output=json',
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.context.envelope.command).toBe('feature');
    expect(json.context.profile.command).toBe('feature');
  });

  test('ccep parse rejects missing --command flag', async () => {
    const result = await runCli(['ccep', 'parse', 'some request', '--output=json']);

    expect(result.exitCode).not.toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(false);
  });

  test('ccep profile rejects unknown command', async () => {
    const result = await runCli(['ccep', 'profile', 'not-a-command', '--output=json']);

    expect(result.exitCode).not.toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(false);
  });

  test('ccep compile emits layered prompt for feature intake', async () => {
    const result = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--phase',
      'intake',
      '--role',
      'task-coach',
      'Add loyalty benefits',
      '--output=json',
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.layers).toHaveLength(7);
    expect(json.prompt).toContain('Planner');
    expect(json.outputSchema).toBe('planner-output');
    expect(json.promptVersion).toBe('v1.0.0');
  });

  test('ccep validate accepts valid implementer output', async () => {
    const payload = JSON.stringify({
      status: 'success',
      confidence: 0.9,
      warnings: [],
      artifacts: [],
      next_actions: [],
      filesChanged: [{ path: 'src/a.ts', summary: 'change' }],
      tests: { runner: 'bun test', result: 'passed' },
    });

    const result = await runCli([
      'ccep',
      'validate',
      '--command',
      'feature',
      '--phase',
      'implement',
      '--role',
      'implementer',
      '--output=json',
      payload,
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.valid).toBe(true);
    expect(json.schema).toBe('implementer-output');
  });

  test('ccep validate rejects invalid reviewer output', async () => {
    const result = await runCli([
      'ccep',
      'validate',
      '--command',
      'feature',
      '--phase',
      'review',
      '--role',
      'reviewer',
      '--output=json',
      '{"status":"pass"}',
    ]);

    expect(result.exitCode).not.toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.valid).toBe(false);
    expect(json.schema).toBe('review-report');
  });
});
