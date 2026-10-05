import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openspecCommand } from '../../src/commands/openspec.command';
import { archiveChangeFolder } from '../../src/core/openspec/openspec-generator';
import type { OpenspecTaskCardInput } from '../../src/validation/schemas';

const FIXTURE = join(import.meta.dir, '../fixtures/backlog/BACKLOG.md');
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoot(light: boolean): Promise<string> {
  const root = join(tmpdir(), `cc-opsx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(root, { recursive: true });
  roots.push(root);
  let markdown = await readFile(FIXTURE, 'utf-8');
  if (light) {
    markdown = markdown
      .replace('Review required: yes', 'Review required: no')
      .replace('TDD required: yes', 'TDD required: no');
  }
  await writeFile(join(root, 'BACKLOG.md'), markdown, 'utf-8');
  return root;
}

async function planItem(
  root: string,
  itemId = 'BC-001',
): Promise<{ changePath: string; taskCards: OpenspecTaskCardInput[] }> {
  const planned = await openspecCommand({
    subcommand: 'plan',
    itemId,
    projectRoot: root,
    output: 'json',
  });
  expect(planned.code).toBe(0);
  return planned.data as { changePath: string; taskCards: OpenspecTaskCardInput[] };
}

async function planAndFinish(root: string, itemId = 'BC-001'): Promise<string> {
  const { changePath, taskCards } = await planItem(root, itemId);
  for (const card of taskCards) {
    const started = await openspecCommand({
      subcommand: 'start',
      itemId: card.id,
      projectRoot: root,
      output: 'json',
    });
    expect(started.code).toBe(0);
    const done = await openspecCommand({
      subcommand: 'done',
      itemId: card.id,
      projectRoot: root,
      output: 'json',
    });
    expect(done.code).toBe(0);
  }
  return changePath;
}

describe('openspec status (opsx-adapted)', () => {
  test('reports artifact presence, checkbox progress, and next steps', async () => {
    const root = await makeRoot(true);
    await planItem(root);
    const status = await openspecCommand({
      subcommand: 'status',
      projectRoot: root,
      output: 'json',
    });
    expect(status.code).toBe(0);
    const data = status.data as {
      artifacts: Record<string, boolean>;
      checkboxProgress: { total: number; complete: number; remaining: number };
      nextSteps: string[];
    };
    expect(data.artifacts).toEqual({
      proposal: true,
      design: true,
      tasks: true,
      specs: true,
    });
    expect(data.checkboxProgress.total).toBeGreaterThan(0);
    expect(data.nextSteps.length).toBeGreaterThan(0);
    expect(data.nextSteps.join(' ')).toContain('BC-001-discover');
  });

  test('suggests planning the next READY item when nothing is active', async () => {
    const root = await makeRoot(true);
    const status = await openspecCommand({
      subcommand: 'status',
      projectRoot: root,
      output: 'json',
    });
    expect(status.code).toBe(0);
    const data = status.data as { nextSteps: string[] };
    expect(data.nextSteps.join(' ')).toMatch(/openspec plan BC-001/);
  });

  test('suggests unblock when a card is blocked', async () => {
    const root = await makeRoot(true);
    await planItem(root);
    expect(
      (
        await openspecCommand({
          subcommand: 'start',
          itemId: 'BC-001-discover',
          projectRoot: root,
          output: 'json',
        })
      ).code,
    ).toBe(0);
    expect(
      (
        await openspecCommand({
          subcommand: 'block',
          itemId: 'BC-001-discover',
          reason: 'waiting on design',
          projectRoot: root,
          output: 'json',
        })
      ).code,
    ).toBe(0);
    const status = await openspecCommand({
      subcommand: 'status',
      projectRoot: root,
      output: 'json',
    });
    const data = status.data as { nextSteps: string[] };
    expect(data.nextSteps.join(' ')).toMatch(/openspec unblock BC-001-discover/);
  });
});

describe('openspec sync', () => {
  test('merges delta specs without archiving the change', async () => {
    const root = await makeRoot(true);
    const { changePath } = await planItem(root);
    const synced = await openspecCommand({
      subcommand: 'sync',
      projectRoot: root,
      output: 'json',
    });
    expect(synced.code).toBe(0);
    const data = synced.data as {
      success: boolean;
      command: string;
      itemId: string;
      syncedPaths: string[];
    };
    expect(data.success).toBe(true);
    expect(data.command).toBe('openspec sync');
    expect(data.itemId).toBe('BC-001');
    expect(data.syncedPaths.length).toBeGreaterThan(0);
    const durable = await readFile(join(root, data.syncedPaths[0] as string), 'utf-8');
    expect(durable).toContain('FR-001');

    const status = await openspecCommand({
      subcommand: 'status',
      projectRoot: root,
      output: 'json',
    });
    const statusData = status.data as {
      activeItemId: string;
      changePaths: Record<string, string>;
    };
    expect(statusData.activeItemId).toBe('BC-001');
    expect(statusData.changePaths['BC-001']).toBe(changePath);
  });

  test('fails without an active change', async () => {
    const root = await makeRoot(true);
    const synced = await openspecCommand({
      subcommand: 'sync',
      projectRoot: root,
      output: 'json',
    });
    expect(synced.code).toBe(1);
    expect(JSON.stringify(synced.data)).toMatch(/No active change/);
  });
});

describe('openspec verify (advisory)', () => {
  test('fresh plan is not archive-ready and stays exit 0', async () => {
    const root = await makeRoot(true);
    await planItem(root);
    const verified = await openspecCommand({
      subcommand: 'verify',
      projectRoot: root,
      output: 'json',
    });
    expect(verified.code).toBe(0);
    const data = verified.data as {
      success: boolean;
      command: string;
      itemId: string;
      advisory: boolean;
      archiveReady: boolean;
      issues: Array<{ severity: string; code: string; dimension: string }>;
    };
    expect(data.success).toBe(true);
    expect(data.command).toBe('openspec verify');
    expect(data.itemId).toBe('BC-001');
    expect(data.advisory).toBe(true);
    expect(data.archiveReady).toBe(false);
    expect(data.issues.some((i) => i.code === 'CARDS_PENDING')).toBe(true);
  });

  test('finished change is archive-ready with every generated checkbox ticked', async () => {
    const root = await makeRoot(true);
    await planAndFinish(root);
    const verified = await openspecCommand({
      subcommand: 'verify',
      projectRoot: root,
      output: 'json',
    });
    expect(verified.code).toBe(0);
    const data = verified.data as {
      archiveReady: boolean;
      issues: Array<{ severity: string; code: string }>;
    };
    expect(data.archiveReady).toBe(true);
    expect(data.issues.some((i) => i.code === 'CHECKBOXES_REMAINING')).toBe(false);
  });

  test('fails without an active change', async () => {
    const root = await makeRoot(true);
    const verified = await openspecCommand({
      subcommand: 'verify',
      projectRoot: root,
      output: 'json',
    });
    expect(verified.code).toBe(1);
    expect(JSON.stringify(verified.data)).toMatch(/No active change/);
  });

  test('flags missing artifacts and scorecard without blocking', async () => {
    const root = await makeRoot(true);
    const { changePath } = await planItem(root);
    await rm(join(root, changePath, 'design.md'), { force: true });
    const verified = await openspecCommand({
      subcommand: 'verify',
      projectRoot: root,
      output: 'json',
    });
    expect(verified.code).toBe(0);
    const data = verified.data as {
      archiveReady: boolean;
      issues: Array<{ severity: string; code: string }>;
    };
    expect(data.archiveReady).toBe(false);
    expect(data.issues.some((i) => i.code === 'ARTIFACT_MISSING')).toBe(true);
  });

  test('flags missing scorecard on a strict backlog', async () => {
    const root = await makeRoot(false);
    await planItem(root);
    const verified = await openspecCommand({
      subcommand: 'verify',
      projectRoot: root,
      output: 'json',
    });
    expect(verified.code).toBe(0);
    const data = verified.data as {
      archiveReady: boolean;
      issues: Array<{ severity: string; code: string }>;
    };
    expect(data.archiveReady).toBe(false);
    expect(
      data.issues.some((i) => i.code === 'SCORECARD_PENDING' && i.severity === 'WARNING'),
    ).toBe(true);
  });
});

describe('openspec archive guards (opsx-adapted)', () => {
  test('refuses to archive when a planning artifact is missing', async () => {
    const root = await makeRoot(true);
    const changePath = await planAndFinish(root);
    await rm(join(root, changePath, 'design.md'), { force: true });
    const archived = await openspecCommand({
      subcommand: 'archive',
      itemId: 'BC-001',
      projectRoot: root,
      output: 'json',
    });
    expect(archived.code).toBe(1);
    expect(JSON.stringify(archived.data)).toMatch(/design\.md/);
  });

  test('refuses to archive when analyze reports CRITICAL', async () => {
    const root = await makeRoot(true);
    const changePath = await planAndFinish(root);
    const specFile = join(root, changePath, 'specs', 'add-backlog-parser', 'spec.md');
    const spec = await readFile(specFile, 'utf-8');
    await writeFile(specFile, spec.replaceAll('MUST', 'could'), 'utf-8');
    const archived = await openspecCommand({
      subcommand: 'archive',
      itemId: 'BC-001',
      projectRoot: root,
      output: 'json',
    });
    expect(archived.code).toBe(1);
    expect(JSON.stringify(archived.data)).toMatch(/CRITICAL/);
  });

  test('--allow-unchecked archives with a warning for unchecked task boxes', async () => {
    const root = await makeRoot(true);
    const changePath = await planAndFinish(root);
    const tasksPath = join(root, changePath, 'tasks.md');
    await writeFile(tasksPath, `${await readFile(tasksPath, 'utf-8')}\n- [ ] Manual pass\n`, 'utf-8');
    const archived = await openspecCommand({
      subcommand: 'archive',
      itemId: 'BC-001',
      allowUnchecked: true,
      projectRoot: root,
      output: 'json',
    });
    expect(archived.code).toBe(0);
    const data = archived.data as { warnings: string[] };
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(data.warnings.join(' ')).toMatch(/checkbox/i);
  });

  test('archive refuses to overwrite an existing archive folder', async () => {
    const root = await makeRoot(true);
    const changeDir = join(root, 'openspec', 'changes', 'bc-001-clash');
    await mkdir(changeDir, { recursive: true });
    await mkdir(join(root, 'openspec', 'changes', 'archive', 'bc-001-clash'), {
      recursive: true,
    });
    let thrown: unknown = null;
    try {
      await archiveChangeFolder(root, 'openspec/changes/bc-001-clash');
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toMatch(/already exists/);
  });
});
