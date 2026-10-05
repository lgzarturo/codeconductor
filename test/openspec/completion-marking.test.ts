import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openspecCommand } from '../../src/commands/openspec.command';
import { countCheckboxes } from '../../src/core/openspec/artifact-progress';
import type { OpenspecTaskCardInput } from '../../src/validation/schemas';

const FIXTURE = join(import.meta.dir, '../fixtures/backlog/BACKLOG.md');
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoot(): Promise<string> {
  const root = join(tmpdir(), `cc-mark-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(root, { recursive: true });
  roots.push(root);
  const markdown = (await readFile(FIXTURE, 'utf-8'))
    .replace('Review required: yes', 'Review required: no')
    .replace('TDD required: yes', 'TDD required: no');
  await writeFile(join(root, 'BACKLOG.md'), markdown, 'utf-8');
  return root;
}

function run(root: string, subcommand: string, itemId?: string, extra: object = {}) {
  return openspecCommand({ subcommand, itemId, projectRoot: root, output: 'json', ...extra });
}

async function plan(root: string) {
  const planned = await run(root, 'plan', 'BC-001');
  expect(planned.code).toBe(0);
  return planned.data as { changePath: string; taskCards: OpenspecTaskCardInput[] };
}

async function finishCards(root: string, cards: OpenspecTaskCardInput[]) {
  for (const card of cards) {
    expect((await run(root, 'start', card.id)).code).toBe(0);
    expect((await run(root, 'done', card.id)).code).toBe(0);
  }
}

describe('openspec completion marking', () => {
  test('done keeps edits made to tasks.md and ticks only that card', async () => {
    const root = await makeRoot();
    const { changePath, taskCards } = await plan(root);
    const tasksPath = join(root, changePath, 'tasks.md');
    const original = await readFile(tasksPath, 'utf-8');
    const custom = `${original}\n\n## Browser checks\n\n- [ ] Verify 375px overflow (manual)\n`;
    await writeFile(tasksPath, custom, 'utf-8');

    await run(root, 'start', taskCards[0]!.id);
    await run(root, 'done', taskCards[0]!.id);

    const after = await readFile(tasksPath, 'utf-8');
    expect(after).toContain('- [ ] Verify 375px overflow (manual)');
    expect(after).toMatch(new RegExp(`- \\[x\\] .*\\(${taskCards[0]!.id}\\)`));
    expect(after).not.toMatch(new RegExp(`- \\[x\\] .*\\(${taskCards[1]!.id}\\)`));
  });

  test('finishing every card leaves no unchecked box in the generated tasks.md', async () => {
    const root = await makeRoot();
    const { changePath, taskCards } = await plan(root);
    await finishCards(root, taskCards);

    const tasks = await readFile(join(root, changePath, 'tasks.md'), 'utf-8');
    expect(countCheckboxes(tasks).remaining).toBe(0);
  });

  test('archive fails on unchecked tasks.md boxes unless --allow-unchecked', async () => {
    const root = await makeRoot();
    const { changePath, taskCards } = await plan(root);
    await finishCards(root, taskCards);
    const tasksPath = join(root, changePath, 'tasks.md');
    await writeFile(
      tasksPath,
      `${await readFile(tasksPath, 'utf-8')}\n- [ ] Manual regression pass\n`,
      'utf-8',
    );

    const refused = await run(root, 'archive', 'BC-001');
    expect(refused.code).toBe(1);
    expect(JSON.stringify(refused.data)).toContain('--allow-unchecked');

    const status = await run(root, 'verify', 'BC-001');
    expect((status.data as { archiveReady: boolean }).archiveReady).toBe(false);

    const allowed = await run(root, 'archive', 'BC-001', { allowUnchecked: true });
    expect(allowed.code).toBe(0);
  });

  test('archive marks the backlog acceptance criteria as complete', async () => {
    const root = await makeRoot();
    const { taskCards } = await plan(root);
    await finishCards(root, taskCards);
    expect((await run(root, 'archive', 'BC-001')).code).toBe(0);

    const backlog = await readFile(join(root, 'BACKLOG.md'), 'utf-8');
    const archived = backlog.slice(backlog.indexOf('## Archive'));
    expect(archived).toContain('- [x] openspec validate accepts well-formed BACKLOG.md');
    expect(archived).not.toContain('- [ ] openspec validate accepts well-formed BACKLOG.md');
  });
});
