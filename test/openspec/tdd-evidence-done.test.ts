import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openspecCommand } from '../../src/commands/openspec.command';
import {
  TDD_CAPTURED_BY,
  TDD_EVIDENCE_SOURCE,
} from '../../src/core/verification/verification-runner';
import { captureReceipt } from '../../src/core/verification/rdd-receipt';
import type { OpenspecTaskCardInput } from '../../src/validation/schemas';

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
