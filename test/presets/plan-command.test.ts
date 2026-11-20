import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

const PLAN_COMMANDS = [
  'presets/cursor/commands/cc/plan.md',
  'presets/claude/commands/cc/plan.md',
  'presets/opencode/commands/cc-plan.md',
  'presets/agy/workflows/cc-plan.md',
  'presets/gemini/commands/cc/plan.toml',
  'presets/codex/skills/cc-plan/SKILL.md',
];

const REQUIRED = [
  'Do not create a Task Card',
  'Do not choose a model',
  'Do not choose a reasoning effort',
  'Do not estimate calendar time',
  'Do not edit source or tests',
  '.codeconductor/plans/',
];

describe('plan command stays an investigation memo', () => {
  for (const rel of PLAN_COMMANDS) {
    test(rel, async () => {
      const content = await readFile(join(ROOT, rel), 'utf-8');
      for (const phrase of REQUIRED) {
        expect(content, `${rel} includes ${phrase}`).toContain(phrase);
      }
    });
  }
});
