import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openspecCommand } from '../../../src/commands/openspec.command';
import type { OpenspecTaskCardInput } from '../../../src/validation/schemas';

const FIXTURE = join(import.meta.dir, '../../fixtures/backlog/BACKLOG.md');

async function tempProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cc-openspec-loop-'));
  await writeFile(join(root, 'BACKLOG.md'), await readFile(FIXTURE, 'utf-8'), 'utf-8');
  return root;
}

function run(
  projectRoot: string,
  subcommand: string,
  itemId?: string,
  reason?: string,
) {
  return openspecCommand({
    subcommand,
    itemId,
    reason,
    projectRoot,
    output: 'json',
  });
}

describe('openspec start/done/block/archive', () => {
  let roots: string[] = [];

  afterAll(async () => {
    await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test('start/done persist card status, regenerate tasks.md, and next skips done cards', async () => {
    const root = await tempProject();
    roots.push(root);

    const planned = await run(root, 'plan', 'BC-001');
    expect(planned.code).toBe(0);
    const plannedData = planned.data as {
      taskCards: OpenspecTaskCardInput[];
      changePath: string;
    };
    const first = plannedData.taskCards[0]!;
    expect(first.status).toBe('pending');

    const nextBefore = await run(root, 'next');
    expect((nextBefore.data as { taskCard: { id: string } }).taskCard.id).toBe(first.id);

    const started = await run(root, 'start', first.id);
    expect(started.code).toBe(0);
    expect((started.data as { cardStatus: string }).cardStatus).toBe('doing');

    const nextWhileDoing = await run(root, 'next');
    expect((nextWhileDoing.data as { taskCard: OpenspecTaskCardInput | null }).taskCard).toBeNull();

    const done = await run(root, 'done', first.id);
    expect(done.code).toBe(0);
    const doneData = done.data as { progress: number; allCardsDone: boolean };
    expect(doneData.progress).toBeGreaterThan(0);
    expect(doneData.allCardsDone).toBe(false);

    const nextAfter = await run(root, 'next');
    const nextCard = (nextAfter.data as { taskCard: { id: string } | null }).taskCard;
    expect(nextCard).not.toBeNull();
    expect(nextCard!.id).not.toBe(first.id);

    const tasks = await readFile(
      join(root, plannedData.changePath, 'tasks.md'),
      'utf-8',
    );
    expect(tasks).toContain('Implementation Tasks');
    expect(tasks).toContain('BC-001-implement');

    const backlog = await readFile(join(root, 'BACKLOG.md'), 'utf-8');
    expect(backlog).toMatch(/- Status: IN_PROGRESS/);
  });

  test('plan does not rewind IN_PROGRESS to PLANNED', async () => {
    const root = await tempProject();
    roots.push(root);
    await run(root, 'plan', 'BC-001');
    const started = await run(root, 'start', 'BC-001-discover');
    expect(started.code).toBe(0);

    const plannedAgain = await run(root, 'plan', 'BC-001');
    expect(plannedAgain.code).toBe(1);
    expect(JSON.stringify(plannedAgain.data)).toMatch(/IN_PROGRESS → PLANNED/);
  });

  test('block requires --reason and marks the item BLOCKED', async () => {
    const root = await tempProject();
    roots.push(root);
    await run(root, 'plan', 'BC-001');
    await run(root, 'start', 'BC-001-discover');

    const missing = await run(root, 'block', 'BC-001-discover');
    expect(missing.code).toBe(1);
    expect(JSON.stringify(missing.data)).toMatch(/--reason is required/);

    const blocked = await run(root, 'block', 'BC-001-discover', 'waiting on design');
    expect(blocked.code).toBe(0);
    expect((blocked.data as { itemStatus: string; reason: string }).itemStatus).toBe('BLOCKED');
    expect((blocked.data as { reason: string }).reason).toBe('waiting on design');
  });

  test('archive requires every card done and moves the change folder', async () => {
    const root = await tempProject();
    roots.push(root);
    const planned = await run(root, 'plan', 'BC-001');
    const cards = (planned.data as { taskCards: OpenspecTaskCardInput[]; changePath: string })
      .taskCards;
    const changePath = (planned.data as { changePath: string }).changePath;

    const early = await run(root, 'archive', 'BC-001');
    expect(early.code).toBe(1);

    for (const card of cards) {
      const start = await run(root, 'start', card.id);
      expect(start.code).toBe(0);
      const done = await run(root, 'done', card.id);
      expect(done.code).toBe(0);
    }

    const archived = await run(root, 'archive', 'BC-001');
    expect(archived.code).toBe(0);
    expect(existsSync(join(root, changePath))).toBe(false);
    expect(existsSync(join(root, 'openspec/changes/archive', changePath.split('/').at(-1)!))).toBe(
      true,
    );
    const backlog = await readFile(join(root, 'BACKLOG.md'), 'utf-8');
    expect(backlog).toMatch(/## Archive[\s\S]*BC-001/);
  });
});
