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

/** Workflows where both a test and an implementation phase apply. */
const TDD_COMMANDS = new Set([
  'feature',
  'fix',
  'tdd-cycle',
  'db-migration',
  'openspec',
  'iterative',
  'security',
]);

const TDD_ORDER_LINE =
  'Canonical delivery order is test-before-implement whenever both phases apply.';

describe('ccep bootstrap TDD guidance is scoped to TDD workflows', () => {
  const EXTRA_COPIES: Array<{ name: string; dir: string; file: (cmd: string) => string }> = [
    { name: 'agents-workflows', dir: '.agents/workflows', file: (cmd) => `cc-${cmd}.md` },
    { name: 'cursor-installed', dir: '.cursor/commands/cc', file: (cmd) => `${cmd}.md` },
  ];

  for (const runner of [...RUNNERS, ...EXTRA_COPIES]) {
    describe(runner.name, () => {
      for (const command of CCEP_COMMANDS) {
        test(`${command} ${TDD_COMMANDS.has(command) ? 'states' : 'omits'} the TDD order line`, async () => {
          const filePath = join(ROOT, runner.dir, runner.file(command));
          let content: string;
          try {
            content = await readFile(filePath, 'utf-8');
          } catch {
            return; // copy not materialised for this runner
          }

          if (TDD_COMMANDS.has(command)) {
            expect(content, filePath).toContain(TDD_ORDER_LINE);
          } else {
            expect(content, filePath).not.toContain(TDD_ORDER_LINE);
          }
        });
      }
    });
  }
});

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
