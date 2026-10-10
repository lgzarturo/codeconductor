import { afterAll, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { scorecardCommand } from '../../src/commands/scorecard.command';
import {
  captureGreen,
  captureRed,
  cleanup,
  os,
  setupFlow,
  touchForeignFile,
  type TddFlow,
} from './tdd-flow-helpers';

/**
 * BC-027 FR-004. Real flow, no seeded evidence. The GREEN is always captured
 * last because `openspec done` of the implement card rewrites BACKLOG.md and
 * tasks.md, which are part of the project-wide receipt.
 */
describe('analyze and scorecard TDD evidence (BC-027 FR-004)', () => {
  const roots: string[] = [];

  afterAll(() => cleanup(roots));

  async function closeTestCard(prefix: string, withRed: boolean): Promise<TddFlow> {
    const flow = await setupFlow(roots, prefix);
    if (withRed) {
      await captureRed(flow.root, flow.testCard.id);
      expect((await os(flow.root, 'done', flow.testCard.id)).code).toBe(0);
      await rm(join(flow.root, '.fail'), { force: true });
    }
    return flow;
  }

  async function missingEvidence(root: string): Promise<boolean> {
    const analyzed = await os(root, 'analyze', 'BC-001');
    return JSON.stringify(analyzed.data).includes('TDD_EVIDENCE_MISSING');
  }

  async function testsScore(root: string): Promise<number> {
    const result = await scorecardCommand({
      subcommand: 'create',
      projectRoot: root,
      output: 'json',
      taskId: 'BC-001',
      fromDiff: true,
    });
    expect(result.code).toBe(0);
    const record = (result.data as {
      scorecard: { criteria: Array<{ id: string; score: number }> };
    }).scorecard;
    return record.criteria.find((c) => c.id === 'tests')!.score;
  }

  test('SC-004: registered RED plus current GREEN leaves analyze clean and scorecard tests measured', async () => {
    const flow = await closeTestCard('cc-bc027-sc004', true);
    await touchForeignFile(flow.root);
    await captureGreen(flow.root, flow.implCard.id);

    expect(await missingEvidence(flow.root)).toBe(false);
    expect(await testsScore(flow.root)).not.toBe(0);
  });

  test('SC-004b: registered RED without a GREEN keeps the finding and scores tests 0', async () => {
    const flow = await closeTestCard('cc-bc027-sc004b', true);
    await touchForeignFile(flow.root);

    expect(await missingEvidence(flow.root)).toBe(true);
    expect(await testsScore(flow.root)).toBe(0);
  });

  test('SC-004c: a current GREEN without any registered or fresh RED scores tests 0', async () => {
    const flow = await closeTestCard('cc-bc027-sc004c', false);
    await touchForeignFile(flow.root);
    await captureGreen(flow.root, flow.implCard.id);

    expect(await missingEvidence(flow.root)).toBe(true);
    expect(await testsScore(flow.root)).toBe(0);
  });
});
