import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureOpenspecConfig,
  generateOpenspecChange,
} from '../../../../src/core/openspec/openspec-generator';
import type { BacklogItemInput, OpenspecTaskCardInput } from '../../../../src/validation/schemas';

const ITEM: BacklogItemInput = {
  id: 'BC-002',
  title: 'Add Search',
  priority: 'P1',
  status: 'READY',
  type: 'feature',
  dependencies: [],
  description: 'Add site search',
  scope: 'search module',
  outOfScope: '',
  acceptanceCriteria: ['Search returns relevant results'],
  progress: 0,
  businessValue: 'more conversions',
  risks: 'performance under load',
};

const CARDS: OpenspecTaskCardInput[] = [
  {
    id: 'BC-002-implement',
    backlogId: 'BC-002',
    phase: 'implement',
    title: 'Implementation',
    prompt: 'p',
    agent: 'implementer',
    dependsOn: [],
    acceptanceCriteria: ['a'],
    status: 'pending',
  },
];

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-openspec-gen-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/openspec/openspec-generator', () => {
  describe('generateOpenspecChange', () => {
    test('writes the change folder with proposal, design, tasks and delta spec', async () => {
      const root = await mkdtemp(join(ROOT, 'proj-'));
      const rel = await generateOpenspecChange(root, ITEM, CARDS);

      expect(rel).toBe('openspec/changes/bc-002-add-search');
      const base = join(root, 'openspec', 'changes', 'bc-002-add-search');
      expect(existsSync(join(base, 'proposal.md'))).toBe(true);
      expect(existsSync(join(base, 'design.md'))).toBe(true);
      expect(existsSync(join(base, 'tasks.md'))).toBe(true);
      expect(existsSync(join(base, 'specs', 'delta.md'))).toBe(true);

      const proposal = await readFile(join(base, 'proposal.md'), 'utf-8');
      expect(proposal).toContain('# Proposal: Add Search');
      expect(proposal).toContain('more conversions');

      const tasks = await readFile(join(base, 'tasks.md'), 'utf-8');
      expect(tasks).toContain('BC-002-implement');
    });
  });

  describe('ensureOpenspecConfig', () => {
    test('creates config.yaml when missing and is idempotent', async () => {
      const root = await mkdtemp(join(ROOT, 'cfg-'));
      const configPath = join(root, 'openspec', 'config.yaml');

      await ensureOpenspecConfig(root);
      expect(existsSync(configPath)).toBe(true);

      // Second call must not throw and must leave the file in place.
      await ensureOpenspecConfig(root);
      expect(existsSync(configPath)).toBe(true);
    });
  });
});
