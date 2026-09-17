import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { rddCommand } from '../src/commands/rdd.command';

const execFileAsync = promisify(execFile);

describe('rdd command', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-rdd-command-'));
    await writeFile(join(projectRoot, 'source.ts'), 'export const value = 1;\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('captures, reports, and invalidates a project receipt', async () => {
    const captured = await rddCommand({
      subcommand: 'capture',
      projectRoot,
      taskId: 'rdd-task',
      phase: 'green',
    });
    expect(captured.code).toBe(0);
    const receiptId = (captured.data as { receiptId: string }).receiptId;

    expect((await rddCommand({ subcommand: 'verify', projectRoot, receiptId })).code).toBe(0);
    await writeFile(join(projectRoot, 'new-source.ts'), 'export const value = 2;\n');

    const stale = await rddCommand({ subcommand: 'verify', projectRoot, receiptId });
    expect(stale.code).toBe(1);
    expect((stale.data as { changedPaths: string[] }).changedPaths).toContain('new-source.ts');

    const status = await rddCommand({ subcommand: 'status', projectRoot, taskId: 'rdd-task' });
    expect((status.data as { receipts: Array<{ valid: boolean }> }).receipts).toEqual([
      expect.objectContaining({ valid: false }),
    ]);
    expect((await rddCommand({ subcommand: 'git-check', projectRoot })).code).toBe(1);
  });

  test('git-check accepts the latest current receipt', async () => {
    await rddCommand({ subcommand: 'capture', projectRoot, taskId: 'rdd-task', phase: 'review' });
    expect((await rddCommand({ subcommand: 'git-check', projectRoot })).code).toBe(0);
  });

  test('verifies an explicit path receipt without treating unrelated files as drift', async () => {
    const captured = await rddCommand({
      subcommand: 'capture',
      projectRoot,
      taskId: 'rdd-task',
      phase: 'review',
      paths: ['source.ts'],
    });
    const receiptId = (captured.data as { receiptId: string }).receiptId;
    await writeFile(join(projectRoot, 'unrelated.ts'), 'export const unrelated = true;\n');

    expect((await rddCommand({ subcommand: 'verify', projectRoot, receiptId })).code).toBe(0);
  });

  test('installs Git gates without discarding an existing hook', async () => {
    await execFileAsync('git', ['init'], { cwd: projectRoot });
    const hooks = join(projectRoot, '.git', 'hooks');
    await writeFile(join(hooks, 'pre-commit'), '#!/bin/sh\necho existing\n');

    const installed = await rddCommand({ subcommand: 'install-hooks', projectRoot });
    expect(installed.code).toBe(0);
    expect(await Bun.file(join(hooks, 'pre-commit.rdd-original')).text()).toContain('existing');
    expect(await Bun.file(join(hooks, 'pre-commit')).text()).toContain('codeconductor-rdd-hook');
    expect(await Bun.file(join(hooks, 'pre-push')).text()).toContain('rdd git-check');
  });
});
