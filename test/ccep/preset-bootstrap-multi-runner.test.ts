import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CCEP_COMMANDS } from '../../src/core/ccep/command-parser';

const ROOT = resolve(import.meta.dir, '../..');

const RUNNERS: Array<{
  name: string;
  dir: string;
  file: (cmd: string) => string;
  skip?: string[];
}> = [
  {
    name: 'cursor',
    dir: 'presets/cursor/commands/cc',
    file: (cmd) => `${cmd}.md`,
  },
  {
    name: 'claude',
    dir: 'presets/claude/commands/cc',
    file: (cmd) => `${cmd}.md`,
  },
  {
    name: 'opencode',
    dir: 'presets/opencode/commands',
    file: (cmd) => `cc-${cmd}.md`,
  },
  {
    name: 'agy',
    dir: 'presets/agy/workflows',
    file: (cmd) => (cmd === 'council' ? 'cc-council.md' : `cc-${cmd}.md`),
    skip: ['commit', 'cc-pipeline'],
  },
];

describe('ccep preset bootstrap — multi-runner', () => {
  for (const runner of RUNNERS) {
    describe(runner.name, () => {
      for (const command of CCEP_COMMANDS) {
        test(`${command} includes CCEP Bootstrap`, async () => {
          const filePath = join(ROOT, runner.dir, runner.file(command));
          const content = await readFile(filePath, 'utf-8');
          expect(content).toContain('## Step 0 — CCEP Bootstrap');
          expect(content).toContain(`--command ${command}`);
          expect(content).toContain('ccep parse');
          expect(content).toContain('ccep resolve');
          expect(content).toContain('ccep profile');
        });
      }
    });
  }
});
