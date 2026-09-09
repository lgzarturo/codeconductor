import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  SDD_DELIVERY_COMMANDS,
  SDD_GATE_HEADING,
  WORKFLOW_COMMANDS,
} from '../../src/core/presets/workflow-commands';
import { formatCcCommand } from '../../src/core/presets/command-invocation';
import { descriptionFrom, readNormalizedSource } from '../../scripts/render-agent-commands';

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

            // The cursor source's "Next command spelling" line bakes in
            // cursor's own colon spelling of itself. Checking the correct
            // spelling is present (above) does not prove the wrong one isn't
            // ALSO present elsewhere in the same file — e.g. codex's "Invoke
            // as `$cc-x`" header used to pass that check while the copied
            // body still leaked cursor's `/cc:x` a few lines down.
            if (target.invoke(cmd) !== formatCcCommand(cmd, 'colon')) {
              expect(content).not.toContain(
                `Next command spelling on this runner: \`${formatCcCommand(cmd, 'colon')}\``
              );
            }
          });
        }
      }
    });
  }
});

describe('generated description parity (gemini + codex derive from cursor)', () => {
  // pagespeed.md carries no frontmatter in the cursor source, so its
  // description legitimately falls back to the generic string — a
  // documented gap in the source content, not a rendering defect.
  const KNOWN_FALLBACK = new Set(['pagespeed']);

  for (const cmd of WORKFLOW_COMMANDS) {
    test(`${cmd} gemini/codex description matches the canonical cursor source`, async () => {
      const source = readNormalizedSource(cmd);
      expect(source).toBeDefined();
      const expected = descriptionFrom(source as string, cmd);

      if (!KNOWN_FALLBACK.has(cmd)) {
        // This is exactly the assertion that would have caught the
        // description-truncation bug: a folded "[cc: alias] ..." YAML block
        // used to get filtered down to its tail, or silently fell back to
        // this generic string when the frontmatter fence didn't match CRLF.
        expect(expected).not.toBe(`CodeConductor ${cmd} workflow`);
      }

      const toml = await readFile(join(ROOT, `presets/gemini/commands/cc/${cmd}.toml`), 'utf-8');
      expect(toml.split('\n')[0]).toBe(`description = ${JSON.stringify(expected)}`);

      const skill = await readFile(join(ROOT, `presets/codex/skills/cc-${cmd}/SKILL.md`), 'utf-8');
      expect(skill).toContain(`description: ${expected}\n`);
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
