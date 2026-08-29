import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../../..');

const COMMAND_FILES = [
  'presets/cursor/commands/cc/backlog.md',
  'presets/claude/commands/cc/backlog.md',
  'presets/opencode/commands/cc-backlog.md',
  'presets/agy/workflows/cc-backlog.md',
];

describe('backlog authoring command contract', () => {
  for (const rel of COMMAND_FILES) {
    test(`${rel} validates, creates or appends, and hands off to /cc-openspec`, async () => {
      const content = await readFile(resolve(ROOT, rel), 'utf-8');
      expect(content).toContain('$ARGUMENTS');
      expect(content).toContain('--command backlog');
      expect(content).toContain('openspec validate');
      expect(content).toContain('skill `backlog`');
      expect(content.toLowerCase()).toMatch(/append/);
      expect(content).toContain('openspec plan');
    });
  }

  test('cursor backlog skill documents create vs append and no git add', async () => {
    const content = await readFile(
      resolve(ROOT, 'presets/cursor/skills/backlog/SKILL.md'),
      'utf-8',
    );
    expect(content).toContain('Create vs append');
    expect(content).toContain('git add');
    expect(content).toContain('openspec validate');
    expect(content).toContain('/cc-openspec');
  });
});
