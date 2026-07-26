/**
 * Tests for openspec state persistence.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadOpenspecState,
  writeOpenspecState,
  getNextTaskCard,
  updateBacklogItemInMarkdown,
} from '../src/core/openspec/openspec-state';
import { scanBacklog } from '../src/core/openspec/backlog-scanner';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let TEST_DIR: string;

describe('openspec-state', () => {
  beforeEach(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-openspec-state-'));
    await mkdir(join(TEST_DIR, '.codeconductor'), { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('write and load round-trip', async () => {
    const state = {
      version: 1 as const,
      activeItemId: 'BC-001',
      taskCards: [],
      changePaths: {},
    };
    const write = await writeOpenspecState(TEST_DIR, state);
    expect(write.success).toBe(true);

    const load = await loadOpenspecState(TEST_DIR);
    expect(load.success).toBe(true);
    if (!load.success) return;
    expect(load.data.activeItemId).toBe('BC-001');
  });

  test('getNextTaskCard respects dependencies', () => {
    const state = {
      version: 1 as const,
      taskCards: [
        {
          id: 'BC-001-discover',
          backlogId: 'BC-001',
          phase: 'discover' as const,
          title: 'discover',
          prompt: 'p',
          agent: 'repo-explorer',
          dependsOn: [],
          acceptanceCriteria: ['a'],
          status: 'done' as const,
        },
        {
          id: 'BC-001-design',
          backlogId: 'BC-001',
          phase: 'design' as const,
          title: 'design',
          prompt: 'p',
          agent: 'architect',
          dependsOn: ['BC-001-discover'],
          acceptanceCriteria: ['a'],
          status: 'pending' as const,
        },
      ],
      changePaths: {},
    };
    const next = getNextTaskCard(state);
    expect(next?.id).toBe('BC-001-design');
  });

  test('updateBacklogItemInMarkdown updates status', () => {
    const content = `## Items\n\n### BC-001 | Test\n- Status: READY\n- Progress: 0%\n`;
    const updated = updateBacklogItemInMarkdown(content, 'BC-001', {
      status: 'IN_PROGRESS',
      progress: 50,
    });
    expect(updated).toContain('Status: IN_PROGRESS');
    expect(updated).toContain('Progress: 50%');
  });
});

describe('backlog-scanner', () => {
  test('scan fixture backlog', async () => {
    const root = resolve(import.meta.dir, 'fixtures/backlog');
    const result = await scanBacklog(root);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contentHash).toBeTruthy();
    expect(result.data.newItems.length).toBeGreaterThan(0);
  });
});
