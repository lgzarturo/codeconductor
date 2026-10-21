import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../src/cli/router';
import { impactCommand } from '../../../src/commands/impact.command';

describe('impact --diff (detect_changes wiring)', () => {
  let repo: string;

  function git(cmd: string): string {
    return execSync(`git ${cmd}`, { cwd: repo, encoding: 'utf8' });
  }

  beforeEach(async () => {
    repo = resolve(tmpdir(), `cc-impact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(repo, 'src'), { recursive: true });
    execSync('git init', { cwd: repo });
    execSync('git config user.email "test@example.com"', { cwd: repo });
    execSync('git config user.name "Test User"', { cwd: repo });
    await writeFile(
      join(repo, 'src', 'a.ts'),
      'export function alpha(): number {\n  return 1;\n}\n\nexport function beta(): number {\n  return 2;\n}\n',
    );
    git('add -A');
    git('commit -qm base');
    await writeFile(
      join(repo, 'src', 'a.ts'),
      'export function alpha(): number {\n  return 10;\n}\n\nexport function beta(): number {\n  return 2;\n}\n',
    );
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  test('reports affected files and symbols without requiring ingest', async () => {
    const result = await impactCommand({ projectRoot: repo, output: 'json', diff: true });
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({
      success: true,
      command: 'impact',
      report: {
        affectedFiles: ['src/a.ts'],
        affectedSymbols: [
          { file: 'src/a.ts', name: 'alpha', kind: 'function', startLine: 1, endLine: 3 },
        ],
      },
    });
  });

  test('human output names the affected symbols', async () => {
    const result = await impactCommand({ projectRoot: repo, output: 'human', diff: true });
    expect(result.code).toBe(0);
    expect((result.data as { output: string }).output).toContain('alpha');
  });

  test('respects an explicit base commit', async () => {
    git('add -A');
    git('commit -qm change');
    const result = await impactCommand({
      projectRoot: repo,
      output: 'json',
      diff: true,
      base: 'HEAD~1',
    });
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({ report: { affectedFiles: ['src/a.ts'] } });
  });

  test('router --diff flag reaches the command', async () => {
    const result = await routeCommand(parseArgs(['impact', '--diff']), repo);
    expect(result.code).toBe(0);
    expect((result.data as { output: string }).output).toContain('src/a.ts:alpha');
  });

  test('existing behavior without flags still requires the graph', async () => {
    const result = await impactCommand({ projectRoot: repo, output: 'json' });
    expect(result.code).toBe(1);
  });
});
