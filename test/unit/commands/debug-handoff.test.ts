import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../src/cli/router';
import { buildDebugHandoff, writeDebugHandoff } from '../../../src/core/goal/debug-handoff';
import { recordTaskStrike, writeGoal } from '../../../src/core/goal/goal-state';
import type { GoalGraphInput } from '../../../src/validation/schemas';

describe('debug handoff', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-dbg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(dir, 'src'), { recursive: true });
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@example.com"', { cwd: dir });
    execSync('git config user.name "Test User"', { cwd: dir });
    await writeFile(join(dir, 'src', 'a.ts'), 'export function alpha(): number {\n  return 1;\n}\n');
    execSync('git add -A', { cwd: dir });
    execSync('git commit -qm base', { cwd: dir });
    await writeFile(join(dir, 'src', 'a.ts'), 'export function alpha(): number {\n  return 2;\n}\n');

    const graph: GoalGraphInput = {
      objective: 'fix it',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 't1',
          title: 'broken worker',
          type: 'fix',
          risk: 'high',
          status: 'in-progress',
          depends_on: [],
          acceptance_criteria: ['tests pass'],
        },
      ],
    };
    expect((await writeGoal(dir, graph)).success).toBe(true);
    await recordTaskStrike(dir, 't1', 'boom 1');
    await recordTaskStrike(dir, 't1', 'boom 2');
    await recordTaskStrike(dir, 't1', 'boom 3');

    await mkdir(join(dir, '.codeconductor'), { recursive: true });
    await writeFile(
      join(dir, '.codeconductor', 'history.jsonl'),
      [
        { taskId: 't1', phase: 'red', iteration: 1, timestamp: '2026-01-01T00:00:00.000Z', summary: 'red written', errors: [] },
        { taskId: 't1', phase: 'green', iteration: 2, timestamp: '2026-01-01T00:01:00.000Z', summary: 'failed again', errors: ['boom 3'] },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n') + '\n',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('package carries breaker state, changed symbols and bounded history', async () => {
    const result = await buildDebugHandoff(dir, 't1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const md = result.data.markdown;
    expect(md).toContain('t1');
    expect(md).toContain('blocked');
    expect(md).toContain('failures: 3');
    expect(md).toContain('Circuit breaker tripped');
    expect(md).toContain('src/a.ts');
    expect(md).toContain('alpha');
    expect(md).toContain('failed again');
    expect(md).not.toContain('boom 1');
  });

  test('missing task errors', async () => {
    expect((await buildDebugHandoff(dir, 'nope')).success).toBe(false);
  });

  test('writeDebugHandoff persists the package under .codeconductor', async () => {
    const written = await writeDebugHandoff(dir, 't1');
    expect(written.success).toBe(true);
    if (!written.success) return;
    expect(written.data.path.endsWith('debug-delegation-t1.md')).toBe(true);
    expect(await readFile(written.data.path, 'utf-8')).toContain('# Debug handoff');
  });

  test('debug handoff wires through the CLI', async () => {
    const json = await routeCommand(
      parseArgs(['debug', 'handoff', '--task', 't1', '--output=json']),
      dir,
    );
    expect(json.code).toBe(0);
    expect(json.data).toMatchObject({ command: 'debug handoff', taskId: 't1' });
    const human = await routeCommand(parseArgs(['debug', 'handoff', '--task', 't1']), dir);
    expect(human.code).toBe(0);
    expect((human.data as { output: string }).output).toContain('# Debug handoff');
    const missing = await routeCommand(parseArgs(['debug', 'handoff', '--task', 'nope']), dir);
    expect(missing.code).toBe(1);
  });
});
