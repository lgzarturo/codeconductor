import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  SDD_DELIVERY_COMMANDS,
  SDD_GATE_HEADING,
  WORKFLOW_COMMANDS,
} from '../../src/core/presets/workflow-commands';
import { formatCcCommand } from '../../src/core/presets/command-invocation';

const ROOT = resolve(import.meta.dir, '../..');

const TARGETS: Array<{
  name: string;
  file: (cmd: string) => string;
  gate: string;
  invoke: (cmd: string) => string;
}> = [
  {
    name: 'cursor',
    file: (cmd) => `presets/cursor/commands/cc/${cmd}.md`,
    gate: SDD_GATE_HEADING,
    invoke: (cmd) => formatCcCommand(cmd, 'colon'),
  },
  {
    name: 'claude',
    file: (cmd) => `presets/claude/commands/cc/${cmd}.md`,
    gate: SDD_GATE_HEADING,
    invoke: (cmd) => formatCcCommand(cmd, 'colon'),
  },
  {
    name: 'opencode',
    file: (cmd) => `presets/opencode/commands/cc-${cmd}.md`,
    gate: SDD_GATE_HEADING,
    invoke: (cmd) => formatCcCommand(cmd, 'hyphen'),
  },
  {
    name: 'agy',
    file: (cmd) =>
      cmd === 'council'
        ? 'presets/agy/workflows/cc-council.md'
        : `presets/agy/workflows/cc-${cmd}.md`,
    gate: SDD_GATE_HEADING,
    invoke: (cmd) => formatCcCommand(cmd, 'hyphen'),
  },
  {
    name: 'gemini',
    file: (cmd) => `presets/gemini/commands/cc/${cmd}.toml`,
    gate: SDD_GATE_HEADING,
    invoke: (cmd) => formatCcCommand(cmd, 'colon'),
  },
  {
    name: 'codex',
    file: (cmd) => `presets/codex/skills/cc-${cmd}/SKILL.md`,
    gate: SDD_GATE_HEADING,
    invoke: (cmd) => formatCcCommand(cmd, 'dollar'),
  },
];

describe('slash command parity (6 targets × workflows)', () => {
  for (const target of TARGETS) {
    describe(target.name, () => {
      for (const cmd of WORKFLOW_COMMANDS) {
        test(`${cmd} has CCEP Step 0`, async () => {
          const content = await readFile(join(ROOT, target.file(cmd)), 'utf-8');
          expect(content).toContain('## Step 0 — CCEP Bootstrap');
          expect(content).toContain(`--command ${cmd}`);
        });

        if (SDD_DELIVERY_COMMANDS.has(cmd)) {
          test(`${cmd} has OpenSpec quality gates`, async () => {
            const content = await readFile(join(ROOT, target.file(cmd)), 'utf-8');
            expect(content).toContain(target.gate);
            expect(content).toContain('openspec analyze');
            expect(content).toContain(target.invoke(cmd));
          });
        }
      }
    });
  }
});

describe('formatCcCommand', () => {
  test('uses the agent-native spelling', () => {
    expect(formatCcCommand('openspec', 'colon')).toBe('/cc:openspec');
    expect(formatCcCommand('openspec', 'hyphen')).toBe('/cc-openspec');
    expect(formatCcCommand('openspec', 'dollar')).toBe('$cc-openspec');
  });
});
