import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tddCommand } from '../../../src/commands/tdd.command';
import * as runner from '../../../src/core/verification/verification-runner';
import { MARKER_SUITE } from '../../openspec/tdd-flow-helpers';

const { hasTddRunnerEvidence } = runner;

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

// BC-027: RED registered at `done` survives later project changes; GREEN never does.
describe('tdd red validation record (BC-027)', () => {
  const TASK = 'BC-27-test';

  async function markerProject(): Promise<string> {
    return projectWithSuite(MARKER_SUITE);
  }

  async function capturedRed(root: string, taskId = TASK): Promise<string> {
    await writeFile(join(root, '.fail'), '');
    const result = await capture(root, { taskId, phase: 'red', command: 'npm test' });
    expect(result.code).toBe(0);
    return (result.data as { evidenceId: string }).evidenceId;
  }

  async function register(root: string, taskId = TASK): Promise<void> {
    expect(typeof runner.recordRedValidation).toBe('function');
    const recorded = await runner.recordRedValidation(root, taskId);
    expect(recorded.success).toBe(true);
  }

  /** The project always changes AFTER registration so the fresh-receipt branch cannot mask the result. */
  async function modifyProject(root: string): Promise<void> {
    await rm(join(root, '.fail'), { force: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'ajeno.ts'), 'export const ajeno = 1;\n');
  }

  const recordFile = (root: string, taskId = TASK) =>
    join(root, '.codeconductor', 'tdd-validations', `${taskId}.json`);

  async function editRecord(root: string, patch: Record<string, unknown>): Promise<void> {
    const record = JSON.parse(await readFile(recordFile(root), 'utf-8')) as Record<string, unknown>;
    await writeFile(recordFile(root), JSON.stringify({ ...record, ...patch }));
  }

  async function editEvidenceReceipt(
    root: string,
    evidenceId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const file = join(root, '.codeconductor', 'evidence', `${evidenceId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
    const evidence = JSON.parse(await readFile(file, 'utf-8'));
    evidence.data.rddReceipt = { ...evidence.data.rddReceipt, ...patch };
    await writeFile(file, JSON.stringify(evidence));
  }

  test('FR-002: a registered RED is accepted after the project changes', async () => {
    const root = await markerProject();
    await capturedRed(root);
    await register(root);
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(true);
  });

  test('SC-002b: stale RED without a record is rejected', async () => {
    const root = await markerProject();
    await capturedRed(root);
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(false);
  });

  test('SC-002b: a deleted record on a changed project is rejected', async () => {
    const root = await markerProject();
    await capturedRed(root);
    await register(root);
    await rm(recordFile(root));
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(false);
  });

  test('SC-002b: a record of another taskId is rejected', async () => {
    const root = await markerProject();
    await capturedRed(root);
    await register(root);
    await editRecord(root, { taskId: 'BC-27-other' });
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(false);
  });

  test('SC-002b: a record with an altered nonce is rejected', async () => {
    const root = await markerProject();
    await capturedRed(root);
    await register(root);
    await editRecord(root, { receiptNonce: 'a'.repeat(32) });
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(false);
  });

  test('SC-002b: a record with an altered manifestHash is rejected', async () => {
    const root = await markerProject();
    await capturedRed(root);
    await register(root);
    await editRecord(root, { manifestHash: 'b'.repeat(64) });
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(false);
  });

  test('SC-002b: a handmade record whose nonce was never registered is rejected', async () => {
    const root = await markerProject();
    const evidenceId = await capturedRed(root);
    await register(root);
    const forgedNonce = 'c'.repeat(32);
    await editEvidenceReceipt(root, evidenceId, { nonce: forgedNonce });
    await editRecord(root, { receiptNonce: forgedNonce });
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(false);
  });

  test('SC-002b: a receipt whose outcome is not failed is rejected', async () => {
    const root = await markerProject();
    const evidenceId = await capturedRed(root);
    await register(root);
    await editEvidenceReceipt(root, evidenceId, { outcome: 'passed' });
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(false);
  });

  test('SC-003: a GREEN made stale by a later change is rejected', async () => {
    const root = await markerProject();
    const result = await capture(root, { taskId: 'BC-27-implement', phase: 'green', command: 'npm test' });
    expect(result.code).toBe(0);
    expect(await hasTddRunnerEvidence(root, 'BC-27-implement', 'green')).toBe(true);
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, 'BC-27-implement', 'green')).toBe(false);
  });

  test('SC-003: a registered RED does not enable a stale GREEN of the same task', async () => {
    const root = await markerProject();
    await capturedRed(root);
    await register(root);
    await rm(join(root, '.fail'), { force: true });
    const green = await capture(root, { taskId: TASK, phase: 'green', command: 'npm test' });
    expect(green.code).toBe(0);
    await modifyProject(root);

    expect(await hasTddRunnerEvidence(root, TASK, 'red')).toBe(true);
    expect(await hasTddRunnerEvidence(root, TASK, 'green')).toBe(false);
  });
});
