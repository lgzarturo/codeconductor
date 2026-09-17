import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openspecCommand } from '../../src/commands/openspec.command';
import { buildScorecardRecord, createDefaultCriteria } from '../../src/core/evaluation/scorecard-calculator';
import { saveScorecard } from '../../src/core/evaluation/outcome-store';
import {
  TDD_CAPTURED_BY,
  TDD_EVIDENCE_SOURCE,
} from '../../src/core/verification/verification-runner';
import { captureReceipt } from '../../src/core/verification/rdd-receipt';
import type { OpenspecTaskCardInput } from '../../src/validation/schemas';

const FIXTURE = join(import.meta.dir, '../fixtures/backlog/BACKLOG.md');

async function writeTddEvidence(root: string, taskId: string, phase: 'test' | 'implement'): Promise<void> {
  const dir = join(root, '.codeconductor', 'evidence');
  await mkdir(dir, { recursive: true });
  const id = `ev-tdd-${taskId}-1`;
  const suitePassed = phase === 'implement';
  const rddReceipt = await captureReceipt(root, {
    taskId,
    phase: suitePassed ? 'green' : 'red',
    paths: ['BACKLOG.md'],
    outcome: suitePassed ? 'passed' : 'failed',
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
      summary: 'TDD suite recorded',
      data: { capturedBy: TDD_CAPTURED_BY, suiteFailed: !suitePassed, suitePassed, rddReceipt },
    }),
  );
}

describe('openspec archive scorecard gate', () => {
  const roots: string[] = [];

  afterAll(async () => {
    await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test('archive fails without PASS scorecard when review is required', async () => {
    const root = join(tmpdir(), `cc-archive-gate-${Date.now()}`);
    await mkdir(root, { recursive: true });
    roots.push(root);
    await writeFile(join(root, 'BACKLOG.md'), await readFile(FIXTURE, 'utf-8'));

    const planned = await openspecCommand({
      subcommand: 'plan',
      itemId: 'BC-001',
      projectRoot: root,
      output: 'json',
    });
    expect(planned.code).toBe(0);
    const cards = (planned.data as { taskCards: OpenspecTaskCardInput[] }).taskCards;

    for (const card of cards) {
      if (card.phase === 'test' || card.phase === 'implement') {
        await writeTddEvidence(root, card.id, card.phase);
      }
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

    const blocked = await openspecCommand({
      subcommand: 'archive',
      itemId: 'BC-001',
      projectRoot: root,
      output: 'json',
    });
    expect(blocked.code).toBe(1);
    expect(JSON.stringify(blocked.data)).toMatch(/PASS scorecard/);

    await saveScorecard(
      root,
      buildScorecardRecord({
        id: 'sc-pass-bc001',
        taskId: 'BC-001',
        agent: 'reviewer',
        contractVersion: 'test',
        criteria: createDefaultCriteria(),
        backlogId: 'BC-001',
        source: 'openspec',
      }),
    );

    const archived = await openspecCommand({
      subcommand: 'archive',
      itemId: 'BC-001',
      projectRoot: root,
      output: 'json',
    });
    expect(archived.code).toBe(0);
  });
});
