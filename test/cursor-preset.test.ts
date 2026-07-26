import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const CLI_CMD = ['bun', 'run', join(PROJECT_ROOT, 'src/cli/main.ts')];
let TEST_DIR: string;

async function runCli(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { spawn } = await import('bun');
  const process = spawn({
    cmd: [...CLI_CMD, ...args],
    cwd: TEST_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  const exitCode = await process.exited;
  return { exitCode, stdout, stderr };
}

async function cleanup() {
  for (const dir of ['.cursor', '.codeconductor']) {
    try {
      await rm(join(TEST_DIR, dir), { recursive: true, force: true });
    } catch {}
  }
  try {
    await rm(join(TEST_DIR, 'AGENTS.md'), { force: true });
    await rm(join(TEST_DIR, '.cursorignore'), { force: true });
  } catch {}
}

describe('cursor preset install', () => {
  beforeEach(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-cursor-preset-'));
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('installs full cursor preset structure', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'preset', '--target=cursor', '--force']);
    expect(result.exitCode).toBe(0);

    expect(existsSync(join(TEST_DIR, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursorignore'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursor', 'rules', 'orchestration.mdc'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursor', 'commands', 'cc', 'feature.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursor', 'skills', 'security', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursor', 'agents', 'security-reviewer.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursor', 'prompts', 'v0.4.0', 'orchestrator.md'))).toBe(true);
  });

  test('AGENTS.md contains Cursor orchestration section', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=cursor', '--force']);

    const content = await readFile(join(TEST_DIR, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('CODECONDUCTOR:BEGIN managed');
    expect(content).toContain('Cursor Subagent Orchestration');
    expect(content).toContain('/multitask');
    expect(content).toContain('.cursor/skills/');
  });

  test('orchestrator agent has Cursor multitask guidance', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=cursor', '--force']);

    const content = await readFile(
      join(TEST_DIR, '.cursor', 'agents', 'orchestrator.md'),
      'utf-8'
    );
    expect(content).toContain('Cursor Subagent Orchestration');
    expect(content).toContain('/multitask');
    expect(content).toContain('security-reviewer');
    expect(content).not.toContain('(Council)');
  });

  test('repo-explorer runs as background subagent', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=cursor', '--force']);

    const content = await readFile(
      join(TEST_DIR, '.cursor', 'agents', 'repo-explorer.md'),
      'utf-8'
    );
    expect(content).toContain('is_background: true');
    expect(content).toContain('composer-2.5-fast');
  });
});
