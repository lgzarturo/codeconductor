import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureReceipt,
  verifyReceipt,
  type RddReceipt,
} from '../src/core/verification/rdd-receipt';

// CA2: the extended RDD receipt must reject manually-crafted JSON. A receipt
// that was never produced by captureReceipt — even with correct per-file
// SHA-256 hashes and a correct manifest hash — must NOT verify.
describe('CA2 — verifyReceipt rejects manual JSON', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-rdd-ca2-'));
    await writeFile(join(projectRoot, 'app.ts'), 'export const answer = 42;\n');
    await writeFile(join(projectRoot, 'app.test.ts'), 'expect(42).toBe(42);\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function assembleManualReceipt(paths: readonly string[]): Promise<RddReceipt> {
    const entries = [];
    for (const path of [...paths].sort()) {
      const content = await readFile(join(projectRoot, path));
      entries.push({ path, hash: createHash('sha256').update(content).digest('hex') });
    }
    const manifestHash = createHash('sha256')
      .update(entries.map((entry) => `${entry.path}\0${entry.hash}`).join('\n'))
      .digest('hex');
    return {
      version: 1,
      taskId: 'task-ca2',
      phase: 'green',
      paths: entries,
      coverage: 'paths',
      manifestHash,
      outcome: 'passed',
      capturedAt: new Date().toISOString(),
    };
  }

  test('hand-written receipt with correct hashes does not verify', async () => {
    const captured = await captureReceipt(projectRoot, {
      taskId: 'task-ca2',
      phase: 'green',
      paths: ['app.ts', 'app.test.ts'],
      outcome: 'passed',
    });
    expect((await verifyReceipt(projectRoot, captured)).valid).toBe(true);

    const tampered = {
      ...captured,
      paths: captured.paths.map((entry) => ({ ...entry, hash: '0'.repeat(64) })),
    };
    expect((await verifyReceipt(projectRoot, tampered)).valid).toBe(false);

    const manual = await assembleManualReceipt(['app.ts', 'app.test.ts']);
    expect((await verifyReceipt(projectRoot, manual)).valid).toBe(false);
  });
});
