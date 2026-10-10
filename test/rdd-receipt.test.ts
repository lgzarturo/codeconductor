import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as rdd from '../src/core/verification/rdd-receipt';
import {
  captureReceipt,
  verifyReceipt,
} from '../src/core/verification/rdd-receipt';

describe('RDD receipts', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-rdd-'));
    await writeFile(join(projectRoot, 'package.json'), '{"name":"fixture"}\n');
    await writeFile(join(projectRoot, 'app.ts'), 'export const answer = 42;\n');
    await writeFile(join(projectRoot, 'app.test.ts'), 'expect(42).toBe(42);\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('binds a receipt to exact files and detects a later byte change', async () => {
    const receipt = await captureReceipt(projectRoot, {
      taskId: 'task-rdd',
      phase: 'green',
      paths: ['app.ts', 'app.test.ts', 'package.json'],
      command: 'bun test app.test.ts',
      outcome: 'passed',
    });

    expect(receipt.paths).toHaveLength(3);
    expect((await verifyReceipt(projectRoot, receipt)).valid).toBe(true);

    await writeFile(join(projectRoot, 'app.test.ts'), 'expect(42).toBe(0);\n');
    const verified = await verifyReceipt(projectRoot, receipt);

    expect(verified.valid).toBe(false);
    expect(verified.changedPaths).toEqual(['app.test.ts']);
  });

  test('rejects paths outside the project root', async () => {
    await expect(
      captureReceipt(projectRoot, {
        taskId: 'task-rdd',
        phase: 'red',
        paths: ['../outside.ts'],
        outcome: 'failed',
      }),
    ).rejects.toThrow('outside the project root');
  });

  test('uses a deterministic manifest regardless of path order', async () => {
    const first = await captureReceipt(projectRoot, {
      taskId: 'task-rdd',
      phase: 'review',
      paths: ['app.ts', 'package.json'],
      outcome: 'passed',
    });
    const second = await captureReceipt(projectRoot, {
      taskId: 'task-rdd',
      phase: 'review',
      paths: ['package.json', 'app.ts'],
      outcome: 'passed',
    });

    expect(first.manifestHash).toBe(second.manifestHash);
  });

  describe('isRegisteredReceipt', () => {
    async function capture() {
      return captureReceipt(projectRoot, {
        taskId: 'task-rdd',
        phase: 'red',
        paths: ['app.ts'],
        outcome: 'failed',
      });
    }

    test('is exported and true for a receipt minted by captureReceipt', async () => {
      expect(typeof rdd.isRegisteredReceipt).toBe('function');
      const receipt = await capture();

      expect(await rdd.isRegisteredReceipt(projectRoot, receipt)).toBe(true);
    });

    test('is false for an invented nonce', async () => {
      expect(typeof rdd.isRegisteredReceipt).toBe('function');
      const receipt = await capture();

      expect(await rdd.isRegisteredReceipt(projectRoot, { ...receipt, nonce: 'd'.repeat(32) })).toBe(false);
    });

    test('is false when the manifestHash differs from the registered one', async () => {
      expect(typeof rdd.isRegisteredReceipt).toBe('function');
      const receipt = await capture();

      expect(await rdd.isRegisteredReceipt(projectRoot, { ...receipt, manifestHash: 'e'.repeat(64) })).toBe(false);
    });

    test('is false for a receipt without a nonce', async () => {
      expect(typeof rdd.isRegisteredReceipt).toBe('function');
      const { nonce: _nonce, ...withoutNonce } = await capture();

      expect(await rdd.isRegisteredReceipt(projectRoot, withoutNonce)).toBe(false);
    });
  });
});
