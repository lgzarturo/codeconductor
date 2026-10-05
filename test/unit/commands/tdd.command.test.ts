import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tddCommand } from '../../../src/commands/tdd.command';
import { hasTddRunnerEvidence } from '../../../src/core/verification/verification-runner';

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function projectWithSuite(testScript: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cc-tdd-cmd-'));
  roots.push(root);
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: testScript } }),
  );
  return root;
}

const FAIL = 'node -e "process.exit(1)"';
const PASS = 'node -e "process.exit(0)"';

function capture(root: string, extra: Record<string, unknown>) {
  return tddCommand({ subcommand: 'capture', projectRoot: root, output: 'json', ...extra });
}

describe('tdd capture', () => {
  test('RED against a failing suite succeeds and records runner evidence', async () => {
    const root = await projectWithSuite(FAIL);
    const result = await capture(root, { taskId: 'BC-1-test', phase: 'red', command: 'npm test' });

    expect(result.code).toBe(0);
    const data = result.data as { evidenceId: string; suiteFailed: boolean };
    expect(data.suiteFailed).toBe(true);
    expect(data.evidenceId).toStartWith('ev-tdd-BC-1-test-');
    expect(await hasTddRunnerEvidence(root, 'BC-1-test', 'red')).toBe(true);
  });

  test('GREEN against a passing suite succeeds', async () => {
    const root = await projectWithSuite(PASS);
    const result = await capture(root, { taskId: 'BC-1-implement', phase: 'green', command: 'npm test' });

    expect(result.code).toBe(0);
    expect(await hasTddRunnerEvidence(root, 'BC-1-implement', 'green')).toBe(true);
  });

  test('RED against a passing suite fails: the test proves nothing', async () => {
    const root = await projectWithSuite(PASS);
    const result = await capture(root, { taskId: 'BC-1-test', phase: 'red', command: 'npm test' });

    expect(result.code).toBe(1);
    expect(JSON.stringify(result.data)).toMatch(/RED.*failing/i);
    expect(await hasTddRunnerEvidence(root, 'BC-1-test', 'red')).toBe(false);
  });

  test('GREEN against a failing suite fails', async () => {
    const root = await projectWithSuite(FAIL);
    const result = await capture(root, { taskId: 'BC-1-implement', phase: 'green', command: 'npm test' });

    expect(result.code).toBe(1);
    expect(JSON.stringify(result.data)).toMatch(/GREEN.*passing/i);
  });

  test('rejects a command outside the test allowlist', async () => {
    const root = await projectWithSuite(PASS);
    const result = await capture(root, { taskId: 'BC-1-test', phase: 'red', command: 'rm -rf /' });

    expect(result.code).toBe(1);
    expect(JSON.stringify(result.data)).toContain('allowlist');
  });

  test('RED is not recorded when the suite command cannot run at all', async () => {
    const root = await projectWithSuite(PASS);
    const result = await capture(root, {
      taskId: 'BC-1-test',
      phase: 'red',
      command: 'nonexistent-command-xyz',
      allowCompileCheck: true,
    });

    expect(result.code).toBe(1);
    expect(await hasTddRunnerEvidence(root, 'BC-1-test', 'red')).toBe(false);
  });

  test('requires --task, --phase red|green and --command', async () => {
    const root = await projectWithSuite(PASS);
    for (const extra of [
      { phase: 'red', command: 'npm test' },
      { taskId: 'T', command: 'npm test' },
      { taskId: 'T', phase: 'refactor', command: 'npm test' },
      { taskId: 'T', phase: 'red' },
    ]) {
      const result = await capture(root, extra);
      expect(result.code).toBe(1);
      expect(JSON.stringify(result.data)).toContain('Usage: tdd capture');
    }
  });
});
