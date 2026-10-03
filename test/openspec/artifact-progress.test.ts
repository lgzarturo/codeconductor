import { describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  countCheckboxes,
  readArtifactProgress,
} from '../../src/core/openspec/artifact-progress';

describe('countCheckboxes', () => {
  test('counts only x/X as complete (opsx task-tracking rule)', () => {
    const progress = countCheckboxes(
      [
        '- [ ] pending task',
        '- [x] done lower',
        '- [X] done upper',
        '- [~] unfamiliar marker stays incomplete',
        'not a checkbox',
        '  - [x] indented done',
      ].join('\n'),
    );
    expect(progress).toEqual({ total: 5, complete: 3, remaining: 2 });
  });

  test('empty markdown has zero tasks', () => {
    expect(countCheckboxes('')).toEqual({ total: 0, complete: 0, remaining: 0 });
  });
});

describe('readArtifactProgress', () => {
  test('reports artifact presence and checkbox progress', async () => {
    const root = join(tmpdir(), `cc-artifact-progress-${Date.now()}`);
    const change = join(root, 'openspec', 'changes', 'bc-001-demo');
    await mkdir(join(change, 'specs', 'demo'), { recursive: true });
    await writeFile(join(change, 'proposal.md'), '# Proposal', 'utf-8');
    await writeFile(join(change, 'design.md'), '# Design', 'utf-8');
    await writeFile(join(change, 'tasks.md'), '- [x] done\n- [ ] todo\n', 'utf-8');
    await writeFile(join(change, 'specs', 'demo', 'spec.md'), '# Spec', 'utf-8');
    try {
      const progress = await readArtifactProgress(root, 'openspec/changes/bc-001-demo');
      expect(progress.artifacts).toEqual({
        proposal: true,
        design: true,
        tasks: true,
        specs: true,
      });
      expect(progress.checkboxes).toEqual({ total: 2, complete: 1, remaining: 1 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('missing change folder reports all absent', async () => {
    const root = join(tmpdir(), `cc-artifact-missing-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const progress = await readArtifactProgress(root, 'openspec/changes/bc-999-nope');
      expect(progress.artifacts).toEqual({
        proposal: false,
        design: false,
        tasks: false,
        specs: false,
      });
      expect(progress.checkboxes).toEqual({ total: 0, complete: 0, remaining: 0 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
