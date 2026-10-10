import { afterAll, describe, expect, test } from 'bun:test';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openspecCommand } from '../../src/commands/openspec.command';
import {
  hasTddRunnerEvidence,
  loadTddSuiteEvidence,
  TDD_CAPTURED_BY,
  TDD_EVIDENCE_SOURCE,
} from '../../src/core/verification/verification-runner';
import { captureReceipt } from '../../src/core/verification/rdd-receipt';
import type { OpenspecTaskCardInput } from '../../src/validation/schemas';
import {
  captureRed,
  cardStatus,
  cleanup,
  os,
  readEvidence,
  readValidation,
  setupFlow,
  touchForeignFile,
  validationPath,
} from './tdd-flow-helpers';

const FIXTURE = join(import.meta.dir, '../fixtures/backlog/BACKLOG.md');

async function writeHandmadeEvidence(root: string, taskId: string): Promise<void> {
  const dir = join(root, '.codeconductor', 'evidence');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'handmade.json'),
    JSON.stringify({
      id: 'handmade',
      source: 'manual',
      type: 'tdd',
      timestamp: new Date().toISOString(),
      relatedTask: taskId,
      confidence: 1,
      data: { capturedBy: 'human', suiteFailed: true, suitePassed: false },
    }),
  );
}

async function writeRunnerEvidence(root: string, taskId: string): Promise<void> {
  const dir = join(root, '.codeconductor', 'evidence');
  await mkdir(dir, { recursive: true });
  const id = `ev-tdd-${taskId}-ok`;
  const rddReceipt = await captureReceipt(root, {
    taskId,
    phase: 'verification',
    paths: ['BACKLOG.md'],
    outcome: 'failed',
  });
  await writeFile(
    join(dir, `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`),
    JSON.stringify({
      id,
      source: TDD_EVIDENCE_SOURCE,
      type: 'tdd',
      timestamp: new Date().toISOString(),
      relatedTask: taskId,
      confidence: 0.9,
      data: { capturedBy: TDD_CAPTURED_BY, suiteFailed: true, suitePassed: false, rddReceipt },
    }),
  );
}

describe('openspec done TDD evidence', () => {
  const roots: string[] = [];

  afterAll(async () => {
    await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test('test/implement done rejects handmade evidence and accepts runner evidence', async () => {
    const root = join(tmpdir(), `cc-tdd-done-${Date.now()}`);
    await mkdir(root, { recursive: true });
    roots.push(root);
    await writeFile(join(root, 'BACKLOG.md'), await readFile(FIXTURE, 'utf-8'));

    const planned = await openspecCommand({
      subcommand: 'plan',
      itemId: 'BC-001',
      projectRoot: root,
      output: 'json',
    });
    const cards = (planned.data as { taskCards: OpenspecTaskCardInput[] }).taskCards;
    const testCard = cards.find((c) => c.phase === 'test')!;

    for (const card of cards) {
      if (card.phase === 'test') break;
      expect(
        (await openspecCommand({
          subcommand: 'start',
          itemId: card.id,
          projectRoot: root,
          output: 'json',
        })).code,
      ).toBe(0);
      expect(
        (await openspecCommand({
          subcommand: 'done',
          itemId: card.id,
          projectRoot: root,
          output: 'json',
        })).code,
      ).toBe(0);
    }

    expect(
      (await openspecCommand({
        subcommand: 'start',
        itemId: testCard.id,
        projectRoot: root,
        output: 'json',
      })).code,
    ).toBe(0);

    await writeHandmadeEvidence(root, testCard.id);
    const rejected = await openspecCommand({
      subcommand: 'done',
      itemId: testCard.id,
      projectRoot: root,
      output: 'json',
    });
    expect(rejected.code).toBe(1);
    expect(JSON.stringify(rejected.data)).toMatch(/verification-runner/);

    await writeRunnerEvidence(root, testCard.id);
    const accepted = await openspecCommand({
      subcommand: 'done',
      itemId: testCard.id,
      projectRoot: root,
      output: 'json',
    });
    expect(accepted.code).toBe(0);
  });
});

describe('openspec done registers the validated RED evidence (BC-027)', () => {
  const roots: string[] = [];

  afterAll(() => cleanup(roots));

  test('FR-005: a RED closed by done stays accepted after an unrelated file changes', async () => {
    const { root, testCard } = await setupFlow(roots, 'cc-bc027-fr005');
    const evidenceId = await captureRed(root, testCard.id);

    expect((await os(root, 'done', testCard.id)).code).toBe(0);

    await rm(join(root, '.fail'), { force: true });
    await touchForeignFile(root);

    // Precondition: the strict, re-hashing loader considers the receipt stale.
    const strict = await loadTddSuiteEvidence(root, testCard.id, evidenceId);
    expect(strict.success).toBe(false);

    expect(await hasTddRunnerEvidence(root, testCard.id, 'red')).toBe(true);
  });

  test('FR-001: done writes a validation record bound to the evidence and its receipt', async () => {
    const { root, testCard } = await setupFlow(roots, 'cc-bc027-fr001');
    const evidenceId = await captureRed(root, testCard.id);

    expect((await os(root, 'done', testCard.id)).code).toBe(0);

    const record = await readValidation(root, testCard.id);
    const evidence = await readEvidence(root, evidenceId);
    expect(record.taskId).toBe(testCard.id);
    expect(record.evidenceId).toBe(evidenceId);
    expect(record.receiptNonce).toBe(evidence.data.rddReceipt.nonce);
    expect(record.manifestHash).toBe(evidence.data.rddReceipt.manifestHash);
    expect(Number.isNaN(Date.parse(String(record.validatedAt)))).toBe(false);
  });

  test('SC-001b: a RED made stale before done rejects done, keeps the card doing and writes no record', async () => {
    const { root, testCard } = await setupFlow(roots, 'cc-bc027-sc001b');
    await captureRed(root, testCard.id);
    await touchForeignFile(root);

    const rejected = await os(root, 'done', testCard.id);

    expect(rejected.code).toBe(1);
    expect(await cardStatus(root, testCard.id)).toBe('doing');
    await expect(access(validationPath(root, testCard.id))).rejects.toThrow();
  });

  test('SC-001c: with several REDs the record points to the fresh one', async () => {
    const { root, testCard } = await setupFlow(roots, 'cc-bc027-sc001c');
    const stale = await captureRed(root, testCard.id);
    await touchForeignFile(root);
    const fresh = await captureRed(root, testCard.id);
    expect(fresh).not.toBe(stale);

    expect((await os(root, 'done', testCard.id)).code).toBe(0);

    expect((await readValidation(root, testCard.id)).evidenceId).toBe(fresh);
  });

  test('SC-001d: if the record cannot be written, done fails and the card stays doing', async () => {
    const { root, testCard } = await setupFlow(roots, 'cc-bc027-sc001d');
    await captureRed(root, testCard.id);
    await mkdir(join(root, '.codeconductor'), { recursive: true });
    await writeFile(join(root, '.codeconductor', 'tdd-validations'), 'not a directory');

    const result = await os(root, 'done', testCard.id);

    expect(result.code).toBe(1);
    expect(await cardStatus(root, testCard.id)).toBe('doing');
  });
});
