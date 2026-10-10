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
    expect(await testsScore(flow.root)).toBe(2);
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

test('BC-028 command measures identical work before and after commit against item base', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdir, mkdtemp, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const root = await mkdtemp(join(tmpdir(), 'cc-bc028-command-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const create = async () => {
    const result = await scorecardCommand({ subcommand: 'create', projectRoot: root, output: 'json', taskId: 'BC-028', fromDiff: true });
    expect(result.code).toBe(0);
    return (result.data as { scorecard: import('../../src/validation/schemas').ScorecardRecordInput }).scorecard;
  };
  try {
    git('init', '-q');
    await writeFile(join(root, '.gitignore'), '.codeconductor/\n');
    await writeFile(join(root, 'work.ts'), 'export const value = 1;\n');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    await mkdir(join(root, '.codeconductor'), { recursive: true });
    await writeFile(join(root, '.codeconductor/openspec-state.json'), JSON.stringify({ version: 1, itemBaseCommits: { 'BC-028': base } }));
    await writeFile(join(root, 'work.ts'), 'export const value = 2;\nexport const extra = 3;\n');
    const before = await create();
    git('add', '.');
    const staged = await create();
    expect(staged.criteria).toEqual(before.criteria);
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'work');
    const after = await create();
    expect(after.criteria).toEqual(before.criteria);
    expect(after.verdict).toBe(before.verdict);
    expect(after.weightedScore).toBe(before.weightedScore);
    expect(after.criteria.find((c) => c.id === 'cc_gain')?.score).not.toBeNull();
    await writeFile(join(root, '.codeconductor/openspec-state.json'), JSON.stringify({ version: 1 }));
    const missing = await create();
    expect(missing.verdict).not.toBe('PASS');
    expect(missing.findings?.join(' ')).toContain('tests');
    expect(missing.findings?.join(' ')).toContain('cc_gain');
    const saved = JSON.parse(await readFile(join(root, '.codeconductor/evaluation/scorecards', `${missing.id}.json`), 'utf8'));
    expect(saved.criteria.find((c: { id: string }) => c.id === 'tests').score).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
