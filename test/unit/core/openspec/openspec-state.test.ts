import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyBacklogTransition,
  archiveItemInMarkdown,
  canTransition,
  escapeRegExp,
  getNextTaskCard,
  hashContent,
  loadOpenspecState,
  setTaskCardStatus,
  updateBacklogItemInMarkdown,
  writeOpenspecState,
} from '../../../../src/core/openspec/openspec-state';
import { isOk } from '../../../../src/utils/result';
import type { OpenspecStateInput, OpenspecTaskCardInput } from '../../../../src/validation/schemas';

const card = (over: Partial<OpenspecTaskCardInput> = {}): OpenspecTaskCardInput => ({
  id: 'c1',
  backlogId: 'BC-001',
  phase: 'implement',
  title: 'T',
  prompt: 'p',
  agent: 'implementer',
  dependsOn: [],
  acceptanceCriteria: ['a'],
  status: 'pending',
  ...over,
});

const state = (cards: OpenspecTaskCardInput[]): OpenspecStateInput => ({
  version: 1,
  taskCards: cards,
  changePaths: {},
  itemSnapshots: {},
});

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-openspec-state-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/openspec/openspec-state', () => {
  describe('canTransition', () => {
    test('allows valid transitions and blocks invalid ones', () => {
      expect(canTransition('TODO', 'READY')).toBe(true);
      expect(canTransition('REVIEW', 'DONE')).toBe(true);
      expect(canTransition('TODO', 'DONE')).toBe(false);
      expect(canTransition('DONE', 'READY')).toBe(false);
    });
  });

  describe('load / write', () => {
    test('missing state file yields a default empty state', async () => {
      const dir = await mkdtemp(join(ROOT, 'empty-'));
      const result = await loadOpenspecState(dir);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.taskCards).toEqual([]);
        expect(result.data.version).toBe(1);
      }
    });

    test('round-trips state through disk', async () => {
      const dir = await mkdtemp(join(ROOT, 'proj-'));
      const written = await writeOpenspecState(dir, state([card()]));
      expect(isOk(written)).toBe(true);
      const loaded = await loadOpenspecState(dir);
      expect(isOk(loaded)).toBe(true);
      if (isOk(loaded)) {
        expect(loaded.data.taskCards).toHaveLength(1);
      }
    });
  });

  describe('setTaskCardStatus', () => {
    test('updates only the matching card', () => {
      const next = setTaskCardStatus(state([card({ id: 'c1' }), card({ id: 'c2' })]), 'c1', 'done');
      expect(next.taskCards.find((c) => c.id === 'c1')?.status).toBe('done');
      expect(next.taskCards.find((c) => c.id === 'c2')?.status).toBe('pending');
    });
  });

  describe('getNextTaskCard', () => {
    test('returns the first actionable pending card, respecting dependencies', () => {
      const s = state([card({ id: 'c1', dependsOn: [] }), card({ id: 'c2', dependsOn: ['c1'] })]);
      expect(getNextTaskCard(s)?.id).toBe('c1');

      const s2 = setTaskCardStatus(s, 'c1', 'done');
      expect(getNextTaskCard(s2)?.id).toBe('c2');
    });

    test('returns null when everything is done', () => {
      expect(getNextTaskCard(state([card({ status: 'done' })]))).toBeNull();
    });
  });

  describe('hashContent', () => {
    test('is a deterministic 16-char hex digest', () => {
      expect(hashContent('abc')).toMatch(/^[0-9a-f]{16}$/);
      expect(hashContent('abc')).toBe(hashContent('abc'));
      expect(hashContent('abc')).not.toBe(hashContent('abd'));
    });
  });

  describe('updateBacklogItemInMarkdown', () => {
    test('rewrites Status and Progress within the target item', () => {
      const md = '### BC-001 | Feature\n- Status: TODO\n- Progress: 0%\n';
      const out = updateBacklogItemInMarkdown(md, 'BC-001', { status: 'READY', progress: 50 });
      expect(out).toContain('- Status: READY');
      expect(out).toContain('- Progress: 50%');
    });
  });

  describe('archiveItemInMarkdown', () => {
    test('moves the item into an Archive section marked DONE', () => {
      const md = [
        '## Items',
        '### BC-001 | Feature',
        '- Status: IN_PROGRESS',
        '- Progress: 80%',
        '### BC-002 | Other',
        '- Status: TODO',
        '- Progress: 0%',
      ].join('\n');
      const out = archiveItemInMarkdown(md, 'BC-001');
      expect(out).toContain('## Archive');
      expect(out).toContain('- Status: DONE');
      expect(out).toContain('BC-002');
    });
  });

  describe('applyBacklogTransition', () => {
    test('rejects illegal transitions with an actionable error', () => {
      const md = '### BC-001 | Feature\n- Status: IN_PROGRESS\n- Progress: 10%\n';
      const result = applyBacklogTransition(md, 'BC-001', 'IN_PROGRESS', 'PLANNED');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toMatch(/IN_PROGRESS → PLANNED/);
      }
    });

    test('allows READY → PLANNED', () => {
      const md = '### BC-001 | Feature\n- Status: READY\n- Progress: 0%\n';
      const result = applyBacklogTransition(md, 'BC-001', 'READY', 'PLANNED');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('- Status: PLANNED');
      }
    });

    test('is idempotent when from and to are the same', () => {
      const md = '### BC-001 | Feature\n- Status: PLANNED\n- Progress: 0%\n';
      const result = applyBacklogTransition(md, 'BC-001', 'PLANNED', 'PLANNED', 10);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('- Progress: 10%');
        expect(result.data).toContain('- Status: PLANNED');
      }
    });
  });

  describe('escapeRegExp', () => {
    test('prevents a crafted id from matching a different heading', () => {
      const md = '### BC-001 | Feature\n- Status: TODO\n### BC-00X | Other\n- Status: READY\n';
      const poisoned = 'BC-00.';
      const out = updateBacklogItemInMarkdown(md, poisoned, { status: 'DONE' });
      expect(out).toContain('- Status: TODO');
      expect(out).toContain('- Status: READY');
      expect(escapeRegExp('BC-00.')).toBe('BC-00\\.');
    });
  });
});
