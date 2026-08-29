import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invokeCli } from './helpers/invoke-cli';

let TEST_DIR: string;

async function runCli(args: string[]) {
  return invokeCli(args, TEST_DIR);
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
    expect(existsSync(join(TEST_DIR, '.cursor', 'agents', 'goal-planner.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursor', 'agents', 'contract-builder.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.cursor', 'prompts', 'v1.0.0', 'orchestrator.md'))).toBe(true);
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
    expect(content).toContain('Target-Specific Orchestration');
    expect(content).toContain('/multitask');
    expect(content).toContain('security-reviewer');
    expect(content).toContain('Evaluation Gate (v0.5.0)');
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
