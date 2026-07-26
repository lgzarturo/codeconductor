import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initWorkflowArtifacts } from '../../../../src/core/ccep/workflow-init';

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-workflow-init-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/ccep/workflow-init', () => {
  test('copies bundled workflow YAML files into the project on first run', async () => {
    const base = await mkdtemp(join(ROOT, 'base-'));
    const created = await initWorkflowArtifacts(base, true);

    expect(created.length).toBeGreaterThan(0);
    for (const rel of created) {
      expect(rel.startsWith('.codeconductor/workflows/')).toBe(true);
      expect(rel.endsWith('.yml')).toBe(true);
    }
    expect(existsSync(join(base, '.codeconductor', 'workflows'))).toBe(true);
  });

  test('skips existing files when force is false, then re-copies when forced', async () => {
    const base = await mkdtemp(join(ROOT, 'base-'));
    const first = await initWorkflowArtifacts(base, true);
    expect(first.length).toBeGreaterThan(0);

    const second = await initWorkflowArtifacts(base, false);
    expect(second).toEqual([]);

    const forced = await initWorkflowArtifacts(base, true);
    expect(forced.length).toBe(first.length);
  });
});
