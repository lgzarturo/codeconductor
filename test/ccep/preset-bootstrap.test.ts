import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CCEP_COMMANDS } from '../../src/core/ccep/command-parser';

const PRESET_ROOT = resolve(import.meta.dir, '../../presets/cursor/commands/cc');

const CURSOR_COMMAND_FILES: Record<string, string> = {
  feature: 'feature.md',
  fix: 'fix.md',
  refactor: 'refactor.md',
  review: 'review.md',
  'test-plan': 'test-plan.md',
  'tdd-cycle': 'tdd-cycle.md',
  'api-contract': 'api-contract.md',
  'db-migration': 'db-migration.md',
  pagespeed: 'pagespeed.md',
  openspec: 'openspec.md',
  scorecard: 'scorecard.md',
};

describe('ccep preset bootstrap — cursor commands', () => {
  for (const command of CCEP_COMMANDS) {
    if (command === 'council') {
      test('council command exists in cursor preset', async () => {
        const councilPath = join(PRESET_ROOT, 'council.md');
        const content = await readFile(councilPath, 'utf-8');
        expect(content).toContain('CCEP Bootstrap');
        expect(content).toContain('command: council');
      });
      continue;
    }

    const file = CURSOR_COMMAND_FILES[command];
    test(`${command} preset includes CCEP Bootstrap step`, async () => {
      const content = await readFile(join(PRESET_ROOT, file!), 'utf-8');
      expect(content).toContain('## Step 0 — CCEP Bootstrap');
      expect(content).toContain(`--command ${command}`);
      expect(content).toContain('ccep parse');
      expect(content).toContain('ccep resolve');
      expect(content).toContain('ccep profile');
    });
  }
});
