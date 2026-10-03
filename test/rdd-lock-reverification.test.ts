import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as rdd from '../src/core/verification/rdd-receipt';

// CA1: hash/lock re-verification on the RDD extension (cc-spec-mutation
// pattern: freeze specs+tests behind a SHA-256 lock, recompute before every
// gate, abort on any single-byte difference). Contract for the implementer:
// rdd-receipt.ts gains `verifyReceiptLock(projectRoot, lockPath)` which reads
// a persisted receipt lock and re-verifies it. No new hash algorithm.
type VerifyReceiptLock = (
  projectRoot: string,
  lockPath: string,
) => Promise<{ valid: boolean; changedPaths: readonly string[] }>;

function gate(): VerifyReceiptLock {
  expect(typeof (rdd as Record<string, unknown>).verifyReceiptLock).toBe('function');
  return (rdd as unknown as { verifyReceiptLock: VerifyReceiptLock }).verifyReceiptLock;
}

describe('CA1 — hash/lock re-verification on RDD extension', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-rdd-ca1-'));
    await mkdir(join(projectRoot, 'specs'), { recursive: true });
    await mkdir(join(projectRoot, 'tests'), { recursive: true });
    await writeFile(join(projectRoot, 'specs', 'task.feature'), 'Feature: task\n');
    await writeFile(join(projectRoot, 'tests', 'task.test.ts'), 'expect(1).toBe(1);\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('persisted lock re-verifies and detects a one-byte change', async () => {
    const verifyReceiptLock = gate();
    const receipt = await rdd.captureReceipt(projectRoot, {
      taskId: 'task-ca1',
      phase: 'verification',
      paths: ['specs/task.feature', 'tests/task.test.ts'],
      outcome: 'passed',
    });
    const lockPath = join(projectRoot, 'task.lock');
    await writeFile(lockPath, JSON.stringify(receipt, null, 2), 'utf-8');

    expect((await verifyReceiptLock(projectRoot, lockPath)).valid).toBe(true);

    await writeFile(join(projectRoot, 'tests', 'task.test.ts'), 'expect(1).toBe(2);\n');
    const reverified = await verifyReceiptLock(projectRoot, lockPath);
    expect(reverified.valid).toBe(false);
    expect([...reverified.changedPaths]).toContain('tests/task.test.ts');
  });

  test('corrupt lock fails closed (invalid, never valid)', async () => {
    const verifyReceiptLock = gate();
    const lockPath = join(projectRoot, 'task.lock');
    await writeFile(lockPath, '{ not valid json', 'utf-8');

    let valid: boolean | 'threw' = 'threw';
    try {
      valid = (await verifyReceiptLock(projectRoot, lockPath)).valid;
    } catch {
      valid = 'threw';
    }
    expect(valid === false || valid === 'threw').toBe(true);
  });
});
