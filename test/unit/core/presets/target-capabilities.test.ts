import { describe, expect, test } from 'bun:test';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadTargetCapabilities } from '../../../../src/core/presets/manifest-loader';
import { surfaceForRunner } from '../../../../src/core/presets/command-invocation';
import { WORKFLOW_COMMANDS } from '../../../../src/core/presets/workflow-commands';

const ROOT = resolve(import.meta.dir, '../../../..');

const TARGETS = ['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy'] as const;

const ODD_COMMAND_PATHS = [
  'presets/cursor/commands/cc/odd.md',
  'presets/claude/commands/cc/odd.md',
  'presets/opencode/commands/cc-odd.md',
  'presets/agy/workflows/cc-odd.md',
  'presets/codex/skills/cc-odd/SKILL.md',
  'presets/gemini/commands/cc/odd.toml',
];

describe('target capability matrix (src/presets/targets/*.yml)', () => {
  for (const target of TARGETS) {
    test(`${target}.yml validates against TargetCapabilitiesSchema`, async () => {
      const caps = await loadTargetCapabilities(target);
      expect(caps.target).toBe(target);
    });

    test(`${target}.yml's invocation matches surfaceForRunner() — the two must not drift apart`, async () => {
      const caps = await loadTargetCapabilities(target);
      expect(caps.invocation).toBe(surfaceForRunner(target));
    });
  }
});

test('every supported target exposes the canonical ODD route', async () => {
  await Promise.all(ODD_COMMAND_PATHS.map((path) => access(join(ROOT, path))));
  expect(WORKFLOW_COMMANDS).toContain('odd');
});

test('pi declares its CLI-only ODD limitation explicitly', async () => {
  const content = await readFile(join(ROOT, 'src/presets/targets/pi.yml'), 'utf-8');
  expect(content).toContain('ODD is available through `bun run dev odd`');
});

test('handoff instructions link durable artifacts without repeating a transcript', async () => {
  for (const path of [
    'presets/cursor/commands/cc/handoff.md',
    'presets/claude/commands/cc/handoff.md',
    'presets/opencode/commands/cc-handoff.md',
    'presets/agy/workflows/cc-handoff.md',
  ]) {
    const content = await readFile(join(ROOT, path), 'utf-8');
    expect(content).toContain('Delivery Ledger');
    expect(content).toContain('verification evidence');
    expect(content).toMatch(/do not\s+repeat[\s\S]*transcript/i);
  }
});

describe('subagentInvocationStyle matches what the rendered commands actually say', () => {
  const MARKDOWN_HAND_AUTHORED: Array<{
    target: 'cursor' | 'claude' | 'opencode' | 'agy';
    file: (cmd: string) => string;
  }> = [
    { target: 'cursor', file: (cmd) => `presets/cursor/commands/cc/${cmd}.md` },
    { target: 'claude', file: (cmd) => `presets/claude/commands/cc/${cmd}.md` },
    { target: 'opencode', file: (cmd) => `presets/opencode/commands/cc-${cmd}.md` },
    {
      target: 'agy',
      file: (cmd) => (cmd === 'council' ? 'presets/agy/workflows/cc-council.md' : `presets/agy/workflows/cc-${cmd}.md`),
    },
  ];

  const PHRASE_FOR_STYLE: Record<string, RegExp> = {
    'task-tool': /via the Task tool/,
    'adopt-role': /[Aa]dopt the .* role as defined in/,
    'invoke-with-context': /Invoke `[a-z-]+` with/,
  };

  for (const { target, file } of MARKDOWN_HAND_AUTHORED) {
    test(`${target}: at least one command's body matches its declared subagentInvocationStyle`, async () => {
      const caps = await loadTargetCapabilities(target);
      expect(caps.subagentInvocationStyle).toBeDefined();
      const pattern = PHRASE_FOR_STYLE[caps.subagentInvocationStyle as string];

      let matched = false;
      for (const cmd of WORKFLOW_COMMANDS) {
        const path = join(ROOT, file(cmd));
        let content: string;
        try {
          content = await readFile(path, 'utf-8');
        } catch {
          continue;
        }
        if (pattern.test(content)) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(true);
    });
  }

  test('gemini/codex generated commands never mention a Task tool they do not have', async () => {
    for (const cmd of WORKFLOW_COMMANDS) {
      const toml = await readFile(join(ROOT, 'presets/gemini/commands/cc', `${cmd}.toml`), 'utf-8');
      const skill = await readFile(join(ROOT, 'presets/codex/skills', `cc-${cmd}`, 'SKILL.md'), 'utf-8');
      expect(toml).not.toContain('Task tool');
      expect(skill).not.toContain('Task tool');
    }
  });
});
